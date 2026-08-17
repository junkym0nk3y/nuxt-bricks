// #region Imports
import { createError } from 'h3';
import sharp from 'sharp';
import type { IImageCropFrame, IImageDimensions, IOptimizedImage } from '../../types/media';
import type { IBricksMediaOptimization } from '../../../common/types/media';
import { createConcurrencyGate, GateOverflowError } from './concurrencyGate';
// #endregion

// #region Data
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
 * Читает размеры входа С УЧЁТОМ EXIF-ориентации — те, в которых изображение
 * видит браузер (ориентацию он применяет сам).
 *
 * Нужны кадрированию: рамку рисует человек по картинке на экране, а `metadata()`
 * отдаёт размеры до поворота. Сверяй рамку с ними — и у повёрнутой съёмкой
 * фотографии проверка границ считалась бы по перепутанным сторонам: законная
 * рамка отвергалась бы как выходящая за край, а невалидная проходила бы в
 * `extract`, который отказал бы уже своей ошибкой.
 *
 * @param buffer Исходные байты изображения.
 * @returns Размеры или null — sharp не смог их определить (вход не растр).
 */
export async function readOrientedImageDimensions(
    buffer: Buffer
): Promise<IImageDimensions | null> {
    try {
        const metadata = await sharpGate.run(() =>
            sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()
        );
        const { width, height } = metadata.autoOrient;

        return width && height ? { width, height } : null;
    } catch (error) {
        if (error instanceof GateOverflowError) {
            rethrowSharpGateOverflow(error);
        }

        console.warn('[Media] Failed to read oriented image dimensions:', error);

        return null;
    }
}

/**
 * Вырезает квадрат по рамке и кодирует его в webp заданной стороны.
 *
 * Порядок операций держится на том, что `autoOrient` — опция ВХОДА (sharp
 * применяет её при декодировании), поэтому `extract` работает в тех же
 * координатах, что видел человек, рисовавший рамку.
 *
 * Результат — один файл на все размеры показа: аватар выводится максимум в
 * 36 пикселей в углу и до сотни в профиле, и набор вариантов ради этого
 * означал бы три объекта в хранилище и три ссылки в колонке вместо одной.
 * Увеличение мелкой рамки до целевой стороны сознательно не запрещено: иначе
 * часть аватаров была бы меньше остальных, и угол экрана «прыгал» бы.
 *
 * Границы рамки обязан проверить вызывающий (см. `readOrientedImageDimensions`):
 * `extract` за краем отказывает своей ошибкой, которая наружу пойдёт
 * четырёхсотым «не удалось обработать» вместо внятного «рамка вне изображения».
 *
 * @param buffer Исходные байты изображения.
 * @param frame Квадратная рамка в координатах ориентированного изображения.
 * @param size Сторона результата в пикселях.
 * @param quality Качество webp-кодирования.
 * @returns Готовые байты, MIME, расширение и размеры результата.
 */
export async function cropSquareImage(
    buffer: Buffer,
    frame: IImageCropFrame,
    size: number,
    quality: number
): Promise<IOptimizedImage> {
    try {
        const encoded = sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
            .autoOrient()
            .extract({
                left: frame.left,
                top: frame.top,
                width: frame.side,
                height: frame.side,
            })
            .resize({ width: size, height: size, fit: 'cover' })
            .webp({ quality });
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
