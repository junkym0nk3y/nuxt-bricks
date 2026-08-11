// #region Imports
import { useAppConfig } from 'nitropack/runtime';
import { createError } from 'h3';
import sharp from 'sharp';
import type {
    IMediaOptimizationRequestFields,
    IOptimizedImage,
    IResolvedMediaConfig,
} from '../../types/media';
import type { IBricksMediaOptimization } from '../../../common/types/media';
import type { TBricksMediaImageFormat } from '../../../common/types/config';
import {
    DEFAULT_MEDIA_MAX_UPLOAD_SIZE_MB,
    DEFAULT_MEDIA_MAX_VIDEO_UPLOAD_SIZE_MB,
    DEFAULT_MEDIA_OPTIMIZATION,
    MEDIA_QUALITY_MAX,
    MEDIA_QUALITY_MIN,
    resolveConfiguredMaxWidth,
    resolveMediaMaxWidthBounds,
} from '../../../common/constants/mediaOptimization';
import { createConcurrencyGate, GateOverflowError } from './concurrencyGate';
// #endregion

// #region Data
const BYTES_IN_MB = 1024 * 1024;
/**
 * Потолок пикселей входного изображения (защита от декомпрессионных бомб):
 * 100 МП покрывает любые реальные фото и в ~2.7 раза ниже дефолта sharp.
 */
const MAX_INPUT_PIXELS = 100_000_000;
/** Максимум одновременных sharp-конвертаций (декодирование держит память/CPU). */
const SHARP_MAX_CONCURRENT = 4;
/** Максимум конвертаций, ожидающих слот; сверх — 503. */
const SHARP_MAX_QUEUE = 32;
const sharpGate = createConcurrencyGate({
    maxConcurrent: SHARP_MAX_CONCURRENT,
    maxQueue: SHARP_MAX_QUEUE,
});
const SUPPORTED_IMAGE_EXTENSIONS = new Set([
    'jpg',
    'jpeg',
    'png',
    'webp',
    'gif',
    'tif',
    'tiff',
    'bmp',
    'heic',
    'heif',
    'avif',
    'svg',
]);
/**
 * Форматы, которые браузер обязан показать сам, — и только для них имеет смысл
 * «Оригинал».
 *
 * Принимаем мы больше (HEIC/HEIF, TIFF, BMP), но сохранение такого входа как
 * есть кончилось бы тем, что постепенная загрузка подменяет рабочее превью
 * неоткрываемым файлом: варианты сгенерированы в webp и видны, а полный — нет.
 * Для этих входов конвертация остаётся обязательной, даже если запрошен
 * «Оригинал».
 */
const WEB_SAFE_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'svg']);
/** MIME по расширению для файлов, сохраняемых без перекодирования. */
const IMAGE_EXTENSION_MIME: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    avif: 'image/avif',
    gif: 'image/gif',
};
const SUPPORTED_VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv']);
/**
 * MIME по контейнеру. `m4v` здесь есть, хотя в списке принимаемых расширений его
 * нет: тот же ISO-BMFF допускает его как имя целевого файла, и без строки в этой
 * карте MIME такого файла брался из клиентского заголовка — то есть в запись
 * уходила произвольная строка вместо типа, выведенного из содержимого.
 */
const VIDEO_EXTENSION_MIME: Record<string, string> = {
    mp4: 'video/mp4',
    m4v: 'video/x-m4v',
    webm: 'video/webm',
    ogg: 'video/ogg',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    mkv: 'video/x-matroska',
};
// #endregion

// #region Helpers
/**
 * Возвращает расширение файла в нижнем регистре без точки или пустую строку, если его нет.
 * @param filename Имя файла.
 */
export function getFileExtension(filename?: string): string {
    if (!filename) {
        return '';
    }

    const trimmed = filename.trim();
    const lastDotIndex = trimmed.lastIndexOf('.');

    if (lastDotIndex <= 0) {
        return '';
    }

    return trimmed.slice(lastDotIndex + 1).toLowerCase();
}

/**
 * Нормализует данные загруженного файла в Buffer.
 * @param data Данные из multipart.
 */
export function toBuffer(data: Buffer | string): Buffer {
    return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

/**
 * Определяет, что файл является SVG, по MIME или расширению.
 * @param fileType MIME из загрузки.
 * @param extension Расширение в нижнем регистре.
 */
export function isSvgFile(fileType: string | undefined, extension: string): boolean {
    return fileType === 'image/svg+xml' || extension === 'svg';
}

/**
 * Проверяет, что загруженное содержимое — изображение (MIME или известное расширение).
 * @param fileType MIME из загрузки.
 * @param extension Расширение в нижнем регистре.
 */
export function isImageFile(fileType: string | undefined, extension: string): boolean {
    if (fileType?.startsWith('image/')) {
        return true;
    }

    if (!extension) {
        return false;
    }

    return SUPPORTED_IMAGE_EXTENSIONS.has(extension);
}

/**
 * Проверяет, что загруженное содержимое — видео (MIME или известное расширение).
 * @param fileType MIME из загрузки.
 * @param extension Расширение в нижнем регистре.
 */
export function isVideoFile(fileType: string | undefined, extension: string): boolean {
    if (fileType?.startsWith('video/')) {
        return true;
    }

    if (!extension) {
        return false;
    }

    return SUPPORTED_VIDEO_EXTENSIONS.has(extension);
}

/**
 * Определяет MIME видеофайла по расширению.
 * @param extension Расширение в нижнем регистре.
 * @param fallbackType MIME из загрузки.
 */
export function resolveVideoMime(extension: string, fallbackType?: string): string {
    return VIDEO_EXTENSION_MIME[extension] ?? fallbackType ?? 'video/mp4';
}

/**
 * Приводит значение к положительному числу, иначе возвращает запасное.
 * @param value Сырое значение.
 * @param fallback Значение по умолчанию.
 */
function resolveNumber(value: unknown, fallback: number): number {
    const numericValue = Number(value);

    if (Number.isFinite(numericValue) && numericValue > 0) {
        return numericValue;
    }

    return fallback;
}

/**
 * Приводит значение к известному формату; неизвестное — к дефолту конфига.
 *
 * @param value Сырое значение (конфиг или поле multipart-формы).
 * @param fallback Значение по умолчанию.
 */
export function resolveImageFormat(
    value: unknown,
    fallback: TBricksMediaImageFormat
): TBricksMediaImageFormat {
    if (value === 'webp' || value === 'original') {
        return value;
    }

    return fallback;
}

/**
 * Приводит качество к тому, что принимает кодировщик.
 *
 * Применяется всегда, включая конфиг: sharp падает на значении вне 1..100, и
 * опечатка в `bricks.media.optimization.quality` роняла бы любую загрузку вместо
 * того, чтобы дать разумный результат.
 *
 * @param quality Сырое качество.
 */
function clampQuality(quality: number): number {
    return Math.min(Math.max(Math.round(quality), MEDIA_QUALITY_MIN), MEDIA_QUALITY_MAX);
}

/**
 * Приводит сырое поле формы к положительному числу.
 *
 * @param value Значение поля или undefined, если поля не было.
 * @returns Число либо null — переопределения не было.
 */
function toRequestedNumber(value: string | undefined): number | null {
    if (typeof value !== 'string' || value.trim() === '') {
        return null;
    }

    const parsed = Number(value);

    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Разбирает НЕДОВЕРЕННЫЕ поля формы и накрывает ими дефолты конфига.
 *
 * Границы применяются только к тому, что действительно пришло с формой: поле
 * поповера ограничивает ввод, а запрос мимо интерфейса им не ограничен —
 * `maxWidth: 1` сохранял бы «полный» файл шириной в один пиксель. Значение из
 * конфига, взятое при отсутствующем поле, границами не режется: пока эта
 * функция принимала уже склеенный объект, отличить одно от другого было
 * нечем, и `maxWidth: 12000` из конфига молча становился 8000.
 *
 * Потолок и пол самого запроса тоже считаются от конфига
 * (`resolveMediaMaxWidthBounds`): значение, которое разработчик выбрал дефолтом,
 * не может быть недостижимо для запроса — интерфейс отправляет его дословно.
 *
 * @param requested Сырые поля multipart-формы.
 * @param fallback Параметры из конфига (уже разрешённые).
 * @returns Эффективные параметры оптимизации.
 */
export function resolveRequestedOptimization(
    requested: IMediaOptimizationRequestFields,
    fallback: IBricksMediaOptimization
): IBricksMediaOptimization {
    const requestedQuality = toRequestedNumber(requested.quality);
    const requestedMaxWidth = toRequestedNumber(requested.maxWidth);
    const maxWidthBounds = resolveMediaMaxWidthBounds(fallback.maxWidth);

    return {
        format: resolveImageFormat(requested.format, fallback.format),
        quality: requestedQuality === null ? fallback.quality : clampQuality(requestedQuality),
        maxWidth:
            requestedMaxWidth === null
                ? fallback.maxWidth
                : Math.min(
                      Math.max(Math.round(requestedMaxWidth), maxWidthBounds.min),
                      maxWidthBounds.max
                  ),
    };
}

/**
 * Читает медиа-настройки (лимит и параметры оптимизации) из app config с дефолтами.
 */
export function resolveMediaConfig(): IResolvedMediaConfig {
    const appConfig = useAppConfig();
    const mediaConfig = appConfig.bricks?.media ?? {};
    const optimization = mediaConfig.optimization ?? {};
    const maxUploadSizeMb = resolveNumber(
        mediaConfig.maxUploadSizeMb,
        DEFAULT_MEDIA_MAX_UPLOAD_SIZE_MB
    );
    const maxVideoUploadSizeMb = resolveNumber(
        mediaConfig.maxVideoUploadSizeMb,
        DEFAULT_MEDIA_MAX_VIDEO_UPLOAD_SIZE_MB
    );

    return {
        maxUploadSizeBytes: maxUploadSizeMb * BYTES_IN_MB,
        maxUploadSizeMb,
        maxVideoUploadSizeBytes: maxVideoUploadSizeMb * BYTES_IN_MB,
        maxVideoUploadSizeMb,
        optimization: {
            format: resolveImageFormat(optimization.format, DEFAULT_MEDIA_OPTIMIZATION.format),
            quality: clampQuality(
                resolveNumber(optimization.quality, DEFAULT_MEDIA_OPTIMIZATION.quality)
            ),
            // Нормализация здесь, а не при разборе запроса: границам запроса это
            // значение больше не подчиняется, а sharp принимает ширину только
            // положительным целым — дробный `maxWidth` из конфига ронял бы загрузку
            maxWidth: resolveConfiguredMaxWidth(optimization.maxWidth),
        },
    };
}

/**
 * Разрешено ли сохранить вход как есть при запрошенном «Оригинале».
 *
 * @param extension Расширение входного файла в нижнем регистре.
 * @returns true — формат web-safe и перекодирование не обязательно.
 */
export function isWebSafeImageExtension(extension: string): boolean {
    return WEB_SAFE_IMAGE_EXTENSIONS.has(extension);
}

/**
 * Переводит ошибку переполнения очереди семафора sharp в 503, остальное
 * пробрасывает как есть.
 *
 * @param error Пойманная ошибка.
 */
function rethrowSharpGateOverflow(error: unknown): never {
    if (error instanceof GateOverflowError) {
        throw createError({
            statusCode: 503,
            statusMessage: 'Server is busy processing images, try again later',
        });
    }

    throw error;
}

/**
 * Определяет, анимирован ли вход (GIF/WebP с несколькими кадрами).
 *
 * Нужно потому, что sharp по умолчанию берёт ПЕРВЫЙ кадр: оптимизация
 * анимированной гифки молча превращала бы её в статичную картинку. Такой вход
 * сохраняется как есть, а варианты для него остаются статичными — это видно и
 * объяснимо, в отличие от потерянной анимации.
 *
 * @param buffer Исходные байты изображения.
 * @returns true — кадров больше одного.
 */
export async function isAnimatedImage(buffer: Buffer): Promise<boolean> {
    try {
        const metadata = await sharpGate.run(() =>
            sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()
        );

        return (metadata.pages ?? 1) > 1;
    } catch (error) {
        if (error instanceof GateOverflowError) {
            rethrowSharpGateOverflow(error);
        }

        // Нечитаемые метаданные — не повод отказать в загрузке: считаем вход
        // статичным, дальше его всё равно проверит сама конвертация
        console.warn('[Media] Failed to read image metadata:', error);

        return false;
    }
}

/**
 * Ресайзит источник (без увеличения) и кодирует в webp.
 *
 * Формата в параметрах нет: перекодирование в проекте одно — webp. Второй
 * целевой формат существовал бы только ради выбора в поповере, а вариантам
 * (`preview`/`mock`) он и тогда был не нужен — они всегда webp.
 *
 * Декодирование ограничено MAX_INPUT_PIXELS (декомпрессионные бомбы) и общим
 * семафором конкурентности; переполнение очереди семафора — 503.
 *
 * @param buffer Исходные байты изображения.
 * @param optimization Ресайз и качество.
 * @returns Готовые байты, MIME, расширение и размеры результата.
 */
export async function optimizeImage(
    buffer: Buffer,
    optimization: Omit<IBricksMediaOptimization, 'format'>
): Promise<IOptimizedImage> {
    try {
        const encoded = sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
            .resize({
                width: optimization.maxWidth,
                fit: 'inside',
                withoutEnlargement: true,
            })
            .webp({ quality: optimization.quality });
        const { data, info } = await sharpGate.run(() =>
            encoded.toBuffer({ resolveWithObject: true })
        );

        return {
            buffer: data,
            mimeType: 'image/webp',
            extension: 'webp',
            width: info.width ?? null,
            height: info.height ?? null,
        };
    } catch (error) {
        rethrowSharpGateOverflow(error);
    }
}

/**
 * Читает пиксельные размеры файла, сохраняемого без перекодирования.
 * null — sharp не смог их определить (в том числе SVG без атрибутов размера).
 *
 * @param buffer Исходные байты изображения.
 */
export async function readImageDimensions(
    buffer: Buffer
): Promise<{ width: number | null; height: number | null }> {
    try {
        const metadata = await sharpGate.run(() =>
            sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()
        );

        return { width: metadata.width ?? null, height: metadata.height ?? null };
    } catch (error) {
        if (error instanceof GateOverflowError) {
            rethrowSharpGateOverflow(error);
        }

        console.warn('[Media] Failed to read image dimensions:', error);

        return { width: null, height: null };
    }
}

/**
 * MIME файла, сохраняемого без перекодирования.
 *
 * @param extension Расширение в нижнем регистре.
 * @param fallbackType MIME из загрузки.
 */
export function resolveImageMime(extension: string, fallbackType?: string): string {
    return IMAGE_EXTENSION_MIME[extension] ?? fallbackType ?? 'image/png';
}
// #endregion
