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
    withMultipartFormData,
} from '../../../../modules/persistence/server/utils/multipartStream';
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
/** Target width of the page thumbnail (px) */
const THUMBNAIL_WIDTH = 480;

/** Quality of the thumbnail webp encoding */
const THUMBNAIL_WEBP_QUALITY = 80;

/**
 * Maximum size of the incoming snapshot (MB) — a canvas snapshot must not weigh
 * more.
 */
const MAX_THUMBNAIL_UPLOAD_MB = 10;

/** Limit of snapshots from one IP per minute */
const THUMBNAILS_PER_MINUTE = 30;
const thumbnailRateLimiter = createFixedWindowRateLimiter({
    limit: THUMBNAILS_PER_MINUTE,
    windowMs: 60_000,
});
// #endregion

// #region Helpers
/**
 * Pulls the snapshot file out of the multipart form and validates that it carries
 * data, fits the size limit and has a raster signature (a canvas snapshot is
 * always a raster image).
 *
 * @param formData - Collection of multipart fields.
 * @returns The file that was found.
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
 * Pulls the pageId out of the multipart form and validates it.
 *
 * @param formData - Collection of multipart fields.
 * @returns A positive integer page identifier.
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
 * Deletes the frame that was just uploaded when the page has vanished: the
 * cleanup of the deleted page ran before this file appeared, and there will be no
 * further pass over its prefix — without the compensation the file would stay in
 * the storage forever.
 *
 * @param uploadedUrl - URL of the uploaded frame.
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
 * POST /api/bricks/media/s3-page-thumbnail — takes a snapshot of the page canvas,
 * re-encodes it into a webp of at most 480px and puts it into the publication
 * storage under the per-upload unique key `page-{pageId}-{uuid}.webp` in the
 * thumbnail namespace of the adapter.
 *
 * The key is unique because the frame is needed not only by the page but also by
 * the version that a save snapshots: with a single overwritten key the whole
 * version history would show the latest frame. Orphans (frames of versions
 * evicted by the pruning of the history) are cleaned up right here — over the
 * prefix of the page, with an exact list of the URLs still needed.
 *
 * Ingress control: a rate limit by IP, the body is read under a hard limit, the
 * content is confirmed by magic bytes, and the re-encoding goes through the
 * shared sharp semaphore with limitInputPixels.
 */
export default defineEventHandler(async (event): Promise<IThumbnailUploadResponse> => {
    try {
        assertWithinRateLimit(event, thumbnailRateLimiter, 'Too many thumbnail uploads');

        const bodyLimitBytes =
            MAX_THUMBNAIL_UPLOAD_MB * 1024 * 1024 + MULTIPART_ENVELOPE_ALLOWANCE_BYTES;

        // Everything happens inside the callback because the ingress slot is held
        // exactly as long as it runs — see `withMultipartParts` for why the form
        // is handed to a callback at all
        return await withMultipartFormData(event, bodyLimitBytes, async (formData) => {
            if (formData.length === 0) {
                throw createError({
                    statusCode: 400,
                    message: 'No file uploaded',
                });
            }

            const file = assertUploadedFile(formData);
            const pageId = assertPageId(formData);

            const storage = useBricksStorageAdapter();

            // The existence of the page is checked before the re-encoding and the
            // upload: the frame of a page that does not exist cannot be cleaned up
            // by anything — the cleanup over the prefix is started by a save or a
            // deletion of that same page, and neither will ever happen
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

            // The repeated read is not a duplicate of the check above: the page
            // could have been deleted while the re-encoding was running. It also
            // supplies the first frame of the page for the keep list, which is why
            // it comes before the version list (see prunePageThumbnailsAfterUpload)
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
        });
    } catch (error: unknown) {
        // h3 errors (limits, 429/413) are rethrown with their own status
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
