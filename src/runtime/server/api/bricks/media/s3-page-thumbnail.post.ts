// #region Imports
import { createError, defineEventHandler } from 'h3';
import { normalizeBricksError } from '../../../../modules/common/utils/main';
import {
    useBricksPublishAdapter,
    useBricksStorageAdapter,
} from '../../../../modules/persistence/server/registry';
import { sniffImageFormat } from '../../../../modules/persistence/server/utils/fileSignatures';
import {
    optimizeImage,
    toBuffer,
} from '../../../../modules/persistence/server/utils/imageProcessing';
import {
    buildPageThumbnailKey,
    prunePageThumbnailsAfterUpload,
} from '../../../../modules/persistence/server/utils/pageThumbnails';
import {
    MULTIPART_ENVELOPE_ALLOWANCE_BYTES,
    readMultipartFormDataWithLimit,
} from '../../../../modules/persistence/server/utils/requestBodyLimits';
import {
    assertWithinRateLimit,
    createFixedWindowRateLimiter,
} from '../../../utils/requestRateLimiter';
import type { IUploadedFilePart } from '../../../../modules/persistence/types/media';
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

/** Лимит снапшотов с одного IP в минуту. */
const THUMBNAILS_PER_MINUTE = 30;
const thumbnailRateLimiter = createFixedWindowRateLimiter({
    limit: THUMBNAILS_PER_MINUTE,
    windowMs: 60_000,
});
// #endregion

// #region Helpers
/**
 * Достаёт файл снапшота из multipart-формы и валидирует наличие данных,
 * лимит размера и растровую сигнатуру содержимого (снапшот канваса —
 * всегда растровое изображение).
 *
 * @param formData - Коллекция multipart-полей.
 * @returns Найденный файл.
 */
function assertUploadedFile(formData: IUploadedFilePart[]): IUploadedFilePart {
    const file = formData.find((item) => item.name === 'file');

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

    const sniffed = sniffImageFormat(toBuffer(file.data));

    if (!sniffed || sniffed === 'svg') {
        throw createError({
            statusCode: 400,
            message: 'Thumbnail content is not a supported image',
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
function assertPageId(formData: IUploadedFilePart[]): number {
    const raw = formData.find((item) => item.name === 'pageId')?.data.toString();
    const pageId = Number(raw);

    if (!Number.isInteger(pageId) || pageId <= 0) {
        throw createError({
            statusCode: 400,
            message: 'Invalid pageId',
        });
    }

    return pageId;
}

/**
 * Удаляет только что загруженный кадр, если страница исчезла: уборка удалённой
 * страницы прошла раньше, чем появился этот файл, и следующего прохода по её
 * префиксу уже не будет — без компенсации файл остался бы в хранилище навсегда.
 *
 * @param uploadedUrl - URL загруженного кадра.
 */
async function discardUploadedThumbnail(uploadedUrl: string): Promise<void> {
    try {
        await useBricksPublishAdapter().deleteFile(uploadedUrl);
    } catch (error: unknown) {
        console.warn('[S3 Page Thumbnail] Failed to discard thumbnail of a missing page:', error);
    }
}
// #endregion

/**
 * POST /api/bricks/media/s3-page-thumbnail — принимает снапшот канваса страницы,
 * пережимает в webp ≤480px и кладёт в хранилище публикации под уникальным на
 * загрузку ключом `page-{pageId}-{uuid}.webp` в thumbnail-namespace адаптера.
 *
 * Ключ уникален, потому что кадр нужен не только странице, но и версии, которую
 * снапшотит сохранение: при одном перезаписываемом ключе вся история версий
 * показывала бы последний кадр. Сироты (кадры версий, вытесненных prune'ом
 * истории) убираются здесь же — по префиксу страницы с точным списком ещё
 * нужных URL.
 *
 * Ingress-контроль: rate limit по IP, тело читается с жёстким лимитом,
 * содержимое подтверждается magic bytes, пережатие — через общий
 * sharp-семафор с limitInputPixels.
 */
export default defineEventHandler(async (event): Promise<IThumbnailUploadResponse> => {
    try {
        assertWithinRateLimit(event, thumbnailRateLimiter, 'Too many thumbnail uploads');

        const bodyLimitBytes =
            MAX_THUMBNAIL_UPLOAD_MB * 1024 * 1024 + MULTIPART_ENVELOPE_ALLOWANCE_BYTES;
        const formData = await readMultipartFormDataWithLimit(event, bodyLimitBytes);

        if (formData.length === 0) {
            throw createError({
                statusCode: 400,
                message: 'No file uploaded',
            });
        }

        const file = assertUploadedFile(formData);
        const pageId = assertPageId(formData);

        const storage = useBricksStorageAdapter();

        // Существование страницы проверяется до пережатия и загрузки: кадр
        // несуществующей страницы не убрать ничем — уборку по префиксу запускает
        // сохранение или удаление той же страницы, а их не будет никогда
        if (!(await storage.getPage(pageId))) {
            throw createError({
                statusCode: 404,
                message: 'Page not found',
            });
        }

        const optimized = await optimizeImage(toBuffer(file.data), {
            maxWidth: THUMBNAIL_WIDTH,
            quality: THUMBNAIL_WEBP_QUALITY,
        });

        const publishAdapter = useBricksPublishAdapter();
        const uploaded = await publishAdapter.uploadFile({
            buffer: optimized.buffer,
            mimeType: optimized.mimeType,
            key: buildPageThumbnailKey(publishAdapter, pageId),
        });

        // Повторное чтение — не дубль проверки выше: страницу могли удалить, пока
        // шло пережатие. Оно же даёт первый кадр страницы для keep-list, и потому
        // идёт раньше списка версий (см. prunePageThumbnailsAfterUpload)
        const page = await storage.getPage(pageId);

        if (!page) {
            await discardUploadedThumbnail(uploaded.url);

            throw createError({
                statusCode: 404,
                message: 'Page not found',
            });
        }

        await prunePageThumbnailsAfterUpload(
            { storage, publish: publishAdapter },
            pageId,
            uploaded.url,
            page.thumbnailUrl
        );

        return {
            success: true,
            url: uploaded.url,
        };
    } catch (error: unknown) {
        // h3-ошибки (лимиты, 429/413) пробрасываем со своим статусом
        if (error && typeof error === 'object' && 'statusCode' in error) {
            throw error;
        }

        console.error('[S3 Page Thumbnail] Error:', error);

        const { statusCode, statusMessage } = normalizeBricksError(
            error,
            'Failed to upload page thumbnail'
        );
        throw createError({ statusCode, message: statusMessage });
    }
});
