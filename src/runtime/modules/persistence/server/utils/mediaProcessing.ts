// #region Imports
import { createError } from 'h3';
import type {
    IBuildUploadedItemParams,
    IValidatedImage,
    IValidatedVideo,
    TMediaOptimization,
} from '../../types/media';
import {
    getFileExtension,
    isImageFile,
    isSvgFile,
    isVideoFile,
    optimizeToWebp,
    resolveVideoMime,
    toBuffer,
} from './imageProcessing';
// #endregion

/**
 * Определяет MIME по имени файла (используется для импортов из S3).
 * @param filename Имя файла.
 */
export function detectMimeTypeByFilename(filename: string): string {
    const extension = filename.split('.').pop()?.toLowerCase();

    if (!extension) {
        return 'image/png';
    }

    if (extension === 'svg') {
        return 'image/svg+xml';
    }

    if (extension === 'jpg' || extension === 'jpeg') {
        return 'image/jpeg';
    }

    if (extension === 'png') {
        return 'image/png';
    }

    if (extension === 'webp') {
        return 'image/webp';
    }

    return 'image/png';
}

/**
 * Забирает содержимое SVG по URL, чтобы сохранить в БД для предпросмотра.
 * @param url Публичная ссылка на файл.
 */
export async function fetchSvgContent(url: string): Promise<string | undefined> {
    try {
        const content = await $fetch<string>(url, { responseType: 'text' });
        return content;
    } catch (error) {
        console.warn('[Media] Failed to fetch SVG content for', url, error);
        return undefined;
    }
}

/**
 * Валидирует тип/размер и оптимизирует изображение (SVG не трогаем).
 * @param file Загруженный multipart-файл.
 * @param maxUploadSizeBytes Лимит размера в байтах.
 * @param maxUploadSizeMb Лимит в мегабайтах (для сообщения).
 * @param optimization Настройки оптимизации.
 */
export async function validateAndOptimizeImage(
    file: IBuildUploadedItemParams['file'],
    maxUploadSizeBytes: number,
    maxUploadSizeMb: number,
    optimization: TMediaOptimization
): Promise<IValidatedImage> {
    const originalExtension = getFileExtension(file.filename);
    const fileBuffer = toBuffer(file.data);

    if (!isImageFile(file.type, originalExtension)) {
        throw createError({
            statusCode: 400,
            message: 'Only image uploads are supported',
        });
    }

    if (fileBuffer.length > maxUploadSizeBytes) {
        throw createError({
            statusCode: 413,
            message: `File is too large. Maximum allowed size is ${Math.floor(maxUploadSizeMb)}MB`,
        });
    }

    const normalizedExtension = originalExtension || '';
    const isSvg = isSvgFile(file.type, normalizedExtension);
    const targetExtension = isSvg ? normalizedExtension || 'svg' : 'webp';

    try {
        const optimizedBuffer = isSvg ? fileBuffer : await optimizeToWebp(fileBuffer, optimization);
        const mimeType = isSvg ? file.type || 'image/svg+xml' : 'image/webp';

        return {
            optimizedBuffer,
            mimeType,
            targetExtension,
            isSvg,
        };
    } catch (error) {
        console.error('[Media Upload] Optimization error:', error);

        throw createError({
            statusCode: 400,
            message: 'Failed to optimize image before upload',
        });
    }
}

/**
 * Валидирует тип/размер видеофайла. Видео не оптимизируется — загружается как есть.
 * @param file Загруженный multipart-файл.
 * @param maxVideoUploadSizeBytes Лимит размера в байтах.
 * @param maxVideoUploadSizeMb Лимит в мегабайтах (для сообщения).
 */
export function validateVideo(
    file: IBuildUploadedItemParams['file'],
    maxVideoUploadSizeBytes: number,
    maxVideoUploadSizeMb: number
): IValidatedVideo {
    const extension = getFileExtension(file.filename);
    const fileBuffer = toBuffer(file.data);

    if (!isVideoFile(file.type, extension)) {
        throw createError({
            statusCode: 400,
            message: 'Unsupported video format',
        });
    }

    if (fileBuffer.length > maxVideoUploadSizeBytes) {
        throw createError({
            statusCode: 413,
            message: `Video is too large. Maximum allowed size is ${Math.floor(maxVideoUploadSizeMb)}MB`,
        });
    }

    const targetExtension = extension || 'mp4';
    const mimeType = resolveVideoMime(targetExtension, file.type);

    return {
        buffer: fileBuffer,
        mimeType,
        targetExtension,
    };
}
