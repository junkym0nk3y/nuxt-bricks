// #region Imports
import { createError } from 'h3';
import type {
    IUploadedFilePart,
    IValidatedImage,
    IValidatedVideo,
    IMediaOptimization,
} from '../../types/media';
import { looksLikeSvgMarkup, sniffImageFormat, sniffVideoFormat } from './fileSignatures';
import { collectWebStreamWithLimit } from './requestBodyLimits';
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

// #region Constants
/** Таймаут чтения SVG-содержимого из хранилища (мс). */
const SVG_FETCH_TIMEOUT_MS = 10_000;
/** Лимит размера SVG-содержимого, сохраняемого в БД для предпросмотра. */
const MAX_SVG_CONTENT_BYTES = 2 * 1024 * 1024;
/** Сколько байт головы файла декодировать для текстовой SVG-проверки. */
const SVG_SNIFF_BYTES = 4096;
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
 * Читает с таймаутом, без редиректов и с жёстким лимитом размера — URL
 * приходит из собственного хранилища, но ресурсные границы обязательны.
 * @param url Публичная ссылка на файл.
 */
export async function fetchSvgContent(url: string): Promise<string | undefined> {
    try {
        const response = await fetch(url, {
            redirect: 'error',
            signal: AbortSignal.timeout(SVG_FETCH_TIMEOUT_MS),
        });

        if (!response.ok || !response.body) {
            return undefined;
        }

        const buffer = await collectWebStreamWithLimit(
            response.body,
            MAX_SVG_CONTENT_BYTES,
            () => new Error(`SVG content exceeds ${MAX_SVG_CONTENT_BYTES} bytes limit`)
        );

        return buffer.toString('utf8');
    } catch (error) {
        console.warn('[Media] Failed to fetch SVG content for', url, error);
        return undefined;
    }
}

/**
 * Проверяет соответствие содержимого заявленному классу «изображение»
 * по magic bytes: SVG — текстовая эвристика корневого тега, растровые —
 * сигнатура известного формата (MIME и расширению не доверяем).
 *
 * @param fileBuffer Байты файла.
 * @param isSvg Файл заявлен как SVG.
 */
function assertImageContentSignature(fileBuffer: Buffer, isSvg: boolean): void {
    if (isSvg) {
        const head = fileBuffer.toString('utf8', 0, Math.min(fileBuffer.length, SVG_SNIFF_BYTES));

        if (!looksLikeSvgMarkup(head)) {
            throw createError({
                statusCode: 400,
                message: 'File content is not a valid SVG image',
            });
        }

        return;
    }

    const sniffed = sniffImageFormat(fileBuffer);

    if (!sniffed || sniffed === 'svg') {
        throw createError({
            statusCode: 400,
            message: 'File content is not a supported image',
        });
    }
}

/**
 * Валидирует тип/размер/сигнатуру и оптимизирует изображение (SVG не трогаем).
 * @param file Загруженный multipart-файл.
 * @param maxUploadSizeBytes Лимит размера в байтах.
 * @param maxUploadSizeMb Лимит в мегабайтах (для сообщения).
 * @param optimization Настройки оптимизации.
 */
export async function validateAndOptimizeImage(
    file: IUploadedFilePart,
    maxUploadSizeBytes: number,
    maxUploadSizeMb: number,
    optimization: IMediaOptimization
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

    assertImageContentSignature(fileBuffer, isSvg);

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
        // h3-ошибки (503 занятого семафора) пробрасываем со своим статусом
        if (error && typeof error === 'object' && 'statusCode' in error) {
            throw error;
        }

        console.error('[Media Upload] Optimization error:', error);

        throw createError({
            statusCode: 400,
            message: 'Failed to optimize image before upload',
        });
    }
}

/**
 * Валидирует тип/размер/сигнатуру видеофайла. Видео не оптимизируется — загружается как есть.
 * @param file Загруженный multipart-файл.
 * @param maxVideoUploadSizeBytes Лимит размера в байтах.
 * @param maxVideoUploadSizeMb Лимит в мегабайтах (для сообщения).
 */
export function validateVideo(
    file: IUploadedFilePart,
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

    if (!sniffVideoFormat(fileBuffer)) {
        throw createError({
            statusCode: 400,
            message: 'File content is not a supported video',
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
