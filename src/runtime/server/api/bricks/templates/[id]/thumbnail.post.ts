// #region Imports
import { createError, defineEventHandler } from 'h3';
import type { IBricksTemplateRow } from '../../../../../modules/common/types/templates';
import {
    useBricksPublishAdapter,
    useBricksStorageAdapter,
} from '../../../../../modules/persistence/server/registry';
import { BricksStorageWriteRejectedError } from '../../../../../modules/persistence/server/utils/storageErrors';
import {
    requireNumericId,
    toHttpError,
} from '../../../../../modules/persistence/server/utils/handlerHelpers';
import { withMultipartFormData } from '../../../../../modules/persistence/server/utils/multipartStream';
import {
    buildTemplateThumbnailKey,
    discardTemplateThumbnail,
} from '../../../../../modules/persistence/server/utils/templateThumbnails';
import {
    THUMBNAILS_PER_MINUTE,
    THUMBNAIL_BODY_LIMIT_BYTES,
    assertUploadedThumbnail,
    optimizeThumbnail,
} from '../../../../../modules/persistence/server/utils/thumbnailUpload';
import {
    assertWithinRateLimit,
    createFixedWindowRateLimiter,
} from '../../../../utils/requestRateLimiter';
// #endregion

// #region Constants
const thumbnailRateLimiter = createFixedWindowRateLimiter({
    limit: THUMBNAILS_PER_MINUTE,
    windowMs: 60_000,
});
// #endregion

/**
 * POST /api/bricks/templates/:id/thumbnail — takes a snapshot of the canvas of the
 * template's editor (multipart `file`), re-encodes it into a webp of at most 480px, puts
 * it under a new key of its own (`template-<uuid>.webp`) and writes its URL into the
 * template's row; answers with the updated row.
 *
 * Unlike a page's frame, the URL is written here rather than by a second PATCH from the
 * client: a template keeps no versions, so nothing but the row ever points at the file,
 * and the previous file goes away as soon as the row points at the new one.
 *
 * The compensation follows the guarantee about the row. A template that vanished during
 * the re-encoding answers `null`, and an update the adapter proved refused throws
 * `BricksStorageWriteRejectedError`: either way the new file is certainly unreferenced
 * and is removed at once. Any other failure leaves the outcome unknown (the statement
 * could have committed before the connection broke), so the file stays: an orphan in
 * the bucket is cheaper than a template whose preview points at a deleted object. Two
 * saves of one template racing each other can orphan the losing frame the same way —
 * the price of "the last save wins" without a lock.
 */
export default defineEventHandler(async (event): Promise<IBricksTemplateRow> => {
    try {
        assertWithinRateLimit(event, thumbnailRateLimiter, 'Too many thumbnail uploads');

        const templateId = requireNumericId(event);

        // Everything happens inside the callback because the ingress slot is held exactly
        // as long as it runs — see `withMultipartParts`
        return await withMultipartFormData(event, THUMBNAIL_BODY_LIMIT_BYTES, async (formData) => {
            const file = assertUploadedThumbnail(formData);
            const storage = useBricksStorageAdapter();

            // Checked before the re-encoding and the upload: a frame of a template that
            // does not exist would only have to be removed again
            const previous = await storage.getTemplate(templateId);

            if (!previous) {
                throw createError({ statusCode: 404, statusMessage: 'Template not found' });
            }

            const optimized = await optimizeThumbnail(file);
            const publish = useBricksPublishAdapter();
            const uploaded = await publish.uploadFile({
                buffer: optimized.buffer,
                mimeType: optimized.mimeType,
                key: buildTemplateThumbnailKey(publish),
            });

            let template: IBricksTemplateRow | null;

            try {
                template = await storage.updateTemplate(templateId, {
                    thumbnailUrl: uploaded.url,
                });
            } catch (error: unknown) {
                if (error instanceof BricksStorageWriteRejectedError) {
                    await discardTemplateThumbnail(publish, uploaded.url, {
                        repeatOnFailure: false,
                    });
                }

                throw error;
            }

            if (!template) {
                await discardTemplateThumbnail(publish, uploaded.url, { repeatOnFailure: false });

                throw createError({ statusCode: 404, statusMessage: 'Template not found' });
            }

            await discardTemplateThumbnail(publish, previous.thumbnailUrl, {
                repeatOnFailure: true,
            });

            return template;
        });
    } catch (error: unknown) {
        toHttpError(error, 'Failed to upload template thumbnail');
    }
});
