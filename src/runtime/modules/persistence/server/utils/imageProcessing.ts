// #region Imports
import { useAppConfig } from 'nitropack/runtime';
import { createError } from 'h3';
import sharp from 'sharp';
import type { IMediaOptimization, IResolvedMediaConfig } from '../../types/media';
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
const DEFAULT_MAX_UPLOAD_SIZE_MB = 10;
const DEFAULT_MAX_VIDEO_UPLOAD_SIZE_MB = 100;
const DEFAULT_OPTIMIZATION_CONFIG: IMediaOptimization = {
    maxWidth: 1920,
    quality: 70,
};
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
const SUPPORTED_VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv']);
const VIDEO_EXTENSION_MIME: Record<string, string> = {
    mp4: 'video/mp4',
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
 * Читает медиа-настройки (лимит и параметры оптимизации) из app config с дефолтами.
 */
export function resolveMediaConfig(): IResolvedMediaConfig {
    const appConfig = useAppConfig();
    const mediaConfig = appConfig.bricks?.media ?? {};
    const optimization = mediaConfig.optimization ?? {};
    const maxWidth = resolveNumber(optimization.maxWidth, DEFAULT_OPTIMIZATION_CONFIG.maxWidth);
    const quality = resolveNumber(optimization.quality, DEFAULT_OPTIMIZATION_CONFIG.quality);
    const maxUploadSizeMb = resolveNumber(mediaConfig.maxUploadSizeMb, DEFAULT_MAX_UPLOAD_SIZE_MB);
    const maxVideoUploadSizeMb = resolveNumber(
        (mediaConfig as Record<string, unknown>).maxVideoUploadSizeMb,
        DEFAULT_MAX_VIDEO_UPLOAD_SIZE_MB
    );

    return {
        maxUploadSizeBytes: maxUploadSizeMb * BYTES_IN_MB,
        maxUploadSizeMb,
        maxVideoUploadSizeBytes: maxVideoUploadSizeMb * BYTES_IN_MB,
        maxVideoUploadSizeMb,
        optimization: {
            maxWidth,
            quality: Math.min(quality, 100),
        },
    };
}

/**
 * Ресайзит источник (без увеличения) и конвертирует в WebP.
 *
 * Декодирование ограничено MAX_INPUT_PIXELS (декомпрессионные бомбы) и общим
 * семафором конкурентности; переполнение очереди семафора — 503.
 *
 * @param buffer Исходные байты изображения.
 * @param optimization Опции ресайза и качества.
 */
export async function optimizeToWebp(
    buffer: Buffer,
    optimization: IMediaOptimization
): Promise<Buffer> {
    try {
        return await sharpGate.run(() =>
            sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
                .resize({
                    width: optimization.maxWidth,
                    fit: 'inside',
                    withoutEnlargement: true,
                })
                .webp({
                    quality: optimization.quality,
                })
                .toBuffer()
        );
    } catch (error) {
        if (error instanceof GateOverflowError) {
            throw createError({
                statusCode: 503,
                statusMessage: 'Server is busy processing images, try again later',
            });
        }

        throw error;
    }
}
// #endregion
