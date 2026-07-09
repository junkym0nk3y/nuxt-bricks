// #region Imports
import sharp from 'sharp';
import { createError, defineEventHandler, readMultipartFormData, type MultiPartData } from 'h3';
import { normalizeBricksError } from '../../../modules/common/utils/main';
import { useBricksPublishAdapter } from '../../../modules/persistence/server/registry';
// #endregion

// #region Interfaces
interface IThumbnailUploadResponse {
    success: boolean;
    url: string;
}
// #endregion

// #region Constants
/** Целевая ширина миниатюры страницы (px). */
const THUMBNAIL_WIDTH = 480;

/** Качество webp-кодирования миниатюры. */
const THUMBNAIL_WEBP_QUALITY = 80;

/** Максимальный размер входного снапшота (МБ) — снапшот канваса не должен весить больше. */
const MAX_THUMBNAIL_UPLOAD_MB = 10;
// #endregion

// #region Helpers
/**
 * Достаёт файл снапшота из multipart-формы и валидирует наличие данных.
 *
 * @param formData - Коллекция multipart-полей.
 * @returns Найденный файл.
 */
function assertUploadedFile(
    formData: Awaited<ReturnType<typeof readMultipartFormData>>
): MultiPartData {
    const file = formData?.find((item) => item.name === 'file');

    if (!file || !file.data || file.data.length === 0) {
        throw createError({
            statusCode: 400,
            message: 'Invalid file data',
        });
    }

    if (file.data.length > MAX_THUMBNAIL_UPLOAD_MB * 1024 * 1024) {
        throw createError({
            statusCode: 413,
            message: `Thumbnail exceeds ${MAX_THUMBNAIL_UPLOAD_MB}MB limit`,
        });
    }

    return file;
}

/**
 * Достаёт и валидирует pageId из multipart-формы.
 *
 * @param formData - Коллекция multipart-полей.
 * @returns Положительный целочисленный идентификатор страницы.
 */
function assertPageId(formData: Awaited<ReturnType<typeof readMultipartFormData>>): number {
    const raw = formData?.find((item) => item.name === 'pageId')?.data.toString();
    const pageId = Number(raw);

    if (!Number.isInteger(pageId) || pageId <= 0) {
        throw createError({
            statusCode: 400,
            message: 'Invalid pageId',
        });
    }

    return pageId;
}
// #endregion

/**
 * POST /mock-api/s3-page-thumbnail — принимает снапшот канваса страницы,
 * пережимает в webp ≤480px и кладёт в хранилище публикации под детерминированным
 * ключом `bricks-thumbnails/page-{pageId}.webp` (перезапись при каждом сохранении — без сирот).
 */
export default defineEventHandler(async (event): Promise<IThumbnailUploadResponse> => {
    try {
        const formData = await readMultipartFormData(event);

        if (!formData || formData.length === 0) {
            throw createError({
                statusCode: 400,
                message: 'No file uploaded',
            });
        }

        const file = assertUploadedFile(formData);
        const pageId = assertPageId(formData);

        const optimizedBuffer = await sharp(file.data)
            .resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true })
            .webp({ quality: THUMBNAIL_WEBP_QUALITY })
            .toBuffer();

        const uploaded = await useBricksPublishAdapter().uploadFile({
            buffer: optimizedBuffer,
            mimeType: 'image/webp',
            key: `bricks-thumbnails/page-${pageId}.webp`,
        });

        return {
            success: true,
            url: uploaded.url,
        };
    } catch (error: unknown) {
        console.error('[S3 Page Thumbnail] Error:', error);

        const { statusCode, statusMessage } = normalizeBricksError(
            error,
            'Failed to upload page thumbnail'
        );
        throw createError({ statusCode, message: statusMessage });
    }
});
