// #region Imports
import { useAppConfig } from 'nitropack/runtime';
import sharp from 'sharp';
import type {
    TFormData,
    TMediaOptimization,
    TResolvedMediaConfig,
} from '../../../media/types/media';
// #endregion

// #region Data
const BYTES_IN_MB = 1024 * 1024;
const DEFAULT_MAX_UPLOAD_SIZE_MB = 10;
const DEFAULT_MAX_VIDEO_UPLOAD_SIZE_MB = 100;
const DEFAULT_OPTIMIZATION_CONFIG: TMediaOptimization = {
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
 * Достает поле из multipart-формы и приводит к строке, если нужно.
 * @param formData Коллекция частей формы.
 * @param name Имя поля.
 */
export function extractFormField(formData: TFormData, name: string): string | undefined {
    const field = formData?.find((item) => item.name === name);
    if (!field || field.data === undefined) {
        return undefined;
    }

    if (typeof field.data === 'string') {
        return field.data;
    }

    return field.data.toString('utf-8');
}

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
 * Возвращает имя файла без расширения.
 * @param filename Имя файла.
 */
export function getFilenameWithoutExtension(filename?: string): string {
    if (!filename) {
        return '';
    }

    const trimmed = filename.trim();
    const lastDotIndex = trimmed.lastIndexOf('.');

    if (lastDotIndex <= 0) {
        return trimmed;
    }

    return trimmed.slice(0, lastDotIndex);
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
export function resolveMediaConfig(): TResolvedMediaConfig {
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
 * @param buffer Исходные байты изображения.
 * @param optimization Опции ресайза и качества.
 */
export async function optimizeToWebp(
    buffer: Buffer,
    optimization: TMediaOptimization
): Promise<Buffer> {
    return sharp(buffer)
        .resize({
            width: optimization.maxWidth,
            fit: 'inside',
            withoutEnlargement: true,
        })
        .webp({
            quality: optimization.quality,
        })
        .toBuffer();
}
// #endregion
