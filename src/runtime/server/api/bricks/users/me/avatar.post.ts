// #region Imports
import { createError, defineEventHandler } from 'h3';
import {
    useBricksAuthAdapter,
    useBricksPublishAdapter,
} from '../../../../../modules/persistence/server/registry';
import {
    buildAvatarKey,
    discardAvatarFile,
} from '../../../../../modules/persistence/server/utils/avatarFiles';
import { sniffImageFormat } from '../../../../../modules/persistence/server/utils/fileSignatures';
import {
    cropSquareImage,
    readOrientedImageDimensions,
    toBuffer,
} from '../../../../../modules/persistence/server/utils/imageProcessing';
import {
    MULTIPART_ENVELOPE_ALLOWANCE_BYTES,
    withMultipartFormData,
} from '../../../../../modules/persistence/server/utils/multipartStream';
import { toHttpError } from '../../../../../modules/persistence/server/utils/handlerHelpers';
import {
    assertProfileAvailable,
    requireSessionUser,
    toAuthProfileUser,
} from '../../../../utils/auth/profile';
// The size ceiling is shared with the profile form: the form prints it in its
// hint and cuts the file off by it before sending (modules/common/constants/auth.ts)
import { BRICKS_AVATAR_MAX_UPLOAD_MB } from '../../../../../modules/common/constants/auth';
import {
    assertWithinRateLimit,
    createFixedWindowRateLimiter,
} from '../../../../utils/requestRateLimiter';
import type {
    IImageCropFrame,
    IUploadedFilePart,
} from '../../../../../modules/persistence/types/media';
// #endregion

// #region Constants
/** Side of the finished avatar (px): one file for every display size */
const AVATAR_SIZE_PX = 256;

/** Quality of the avatar webp encoding */
const AVATAR_WEBP_QUALITY = 82;

/**
 * Minimum side of the crop frame (px). Anything smaller is not cropping but the
 * blow-up of a handful of pixels to 256: the result is unreadable and the reason
 * unclear to the user. Better to refuse with a comprehensible message.
 */
const MIN_CROP_SIDE_PX = 32;

/** Limit of avatar uploads from one IP per minute (each one is a sharp pass) */
const AVATAR_UPLOADS_PER_MINUTE = 20;
const avatarRateLimiter = createFixedWindowRateLimiter({
    limit: AVATAR_UPLOADS_PER_MINUTE,
    windowMs: 60_000,
});
// #endregion

// #region Helpers
/**
 * Pulls the photo file out of the multipart form and checks its size and content.
 *
 * The content is confirmed by its signature, not by the MIME type and not by the
 * extension: anyone can declare `image/png`. SVG is rejected explicitly — a
 * vector in an avatar would mean untrusted markup that would have to be
 * sanitized and served as a document, whereas the whole point of this handler is
 * that what leaves it is a raster re-encoded by sharp.
 *
 * @param formData - Collection of multipart fields.
 * @returns The file that was found.
 */
function assertAvatarFile(formData: IUploadedFilePart[]): IUploadedFilePart {
    const file = formData.find((item) => item.name === 'file');

    if (!file || !file.data || file.data.length === 0) {
        throw createError({
            statusCode: 400,
            message: 'Invalid file data',
        });
    }

    if (file.data.length > BRICKS_AVATAR_MAX_UPLOAD_MB * 1024 * 1024) {
        throw createError({
            statusCode: 413,
            message: `Avatar exceeds ${BRICKS_AVATAR_MAX_UPLOAD_MB}MB limit`,
        });
    }

    const sniffed = sniffImageFormat(toBuffer(file.data));

    if (!sniffed || sniffed === 'svg') {
        throw createError({
            statusCode: 400,
            message: 'Avatar content is not a supported raster image',
        });
    }

    return file;
}

/**
 * Reads a non-negative integer field of the form.
 *
 * @param formData - Collection of multipart fields.
 * @param name - Field name.
 * @returns The field value.
 */
function requireIntegerField(formData: IUploadedFilePart[], name: string): number {
    const raw = formData.find((item) => item.name === name)?.data.toString();
    const value = Number(raw);

    if (!Number.isInteger(value) || value < 0) {
        throw createError({
            statusCode: 400,
            message: `Field "${name}" must be a non-negative integer`,
        });
    }

    return value;
}

/**
 * Reads the crop frame out of the form fields.
 *
 * The frame is mandatory rather than "centered by default": the center of a
 * photograph almost never coincides with the face, and a silent center crop would
 * pass a lost frame (after an edit of the form, say) off as a normal result — the
 * person would see someone else's framing and not understand why.
 *
 * @param formData - Collection of multipart fields.
 * @returns A square frame in the coordinates of the oriented image.
 */
function requireCropFrame(formData: IUploadedFilePart[]): IImageCropFrame {
    const side = requireIntegerField(formData, 'cropSide');

    if (side < MIN_CROP_SIDE_PX) {
        throw createError({
            statusCode: 400,
            message: `Field "cropSide" must be at least ${MIN_CROP_SIDE_PX} pixels`,
        });
    }

    return {
        left: requireIntegerField(formData, 'cropX'),
        top: requireIntegerField(formData, 'cropY'),
        side,
    };
}

/**
 * Checks that the frame lies entirely inside the image.
 *
 * A check of our own rather than the refusal of sharp: `extract` past the edge
 * throws `extract_area: bad extract area`, which reaches the client as "failed to
 * process the image" — a text from which one cannot tell that the frame is at
 * fault.
 *
 * @param frame - Crop frame.
 * @param width - Image width with the EXIF orientation applied.
 * @param height - Image height with the EXIF orientation applied.
 */
function assertFrameWithinImage(frame: IImageCropFrame, width: number, height: number): void {
    if (frame.left + frame.side > width || frame.top + frame.side > height) {
        throw createError({
            statusCode: 400,
            message: `Crop frame is outside the image (${width}x${height})`,
        });
    }
}
// #endregion

/**
 * POST /api/bricks/users/me/avatar — the photo of one's own profile (any role).
 *
 * Takes the source file and the crop frame (`cropX`, `cropY`, `cropSide` in the
 * pixels of the image as the browser sees it, with the EXIF orientation
 * applied), puts ONE 256x256 webp into the storage and writes a link to it into
 * the account.
 *
 * The photo does not go through the media library: had avatars landed in the
 * gallery, any editor would see them among the working files and could delete
 * someone else's photo. Hence the managed storage prefix of their own.
 *
 * The order is mandatory: first the write of the new link, then the deletion of
 * the previous file. The reverse order would leave the account pointing at a
 * deleted object should the write fail — that is, an empty square instead of the
 * previous photo.
 */
export default defineEventHandler(async (event) => {
    try {
        assertProfileAvailable(event);

        const sessionUser = requireSessionUser(event);

        assertWithinRateLimit(event, avatarRateLimiter, 'Too many avatar uploads');

        const bodyLimitBytes =
            BRICKS_AVATAR_MAX_UPLOAD_MB * 1024 * 1024 + MULTIPART_ENVELOPE_ALLOWANCE_BYTES;

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

            const file = assertAvatarFile(formData);
            const frame = requireCropFrame(formData);
            const source = toBuffer(file.data);
            const dimensions = await readOrientedImageDimensions(source);

            if (!dimensions) {
                throw createError({
                    statusCode: 400,
                    message: 'Avatar content is not a supported raster image',
                });
            }

            assertFrameWithinImage(frame, dimensions.width, dimensions.height);

            let cropped;

            try {
                cropped = await cropSquareImage(source, frame, AVATAR_SIZE_PX, AVATAR_WEBP_QUALITY);
            } catch (error: unknown) {
                // The 503 of a busy sharp semaphore is rethrown with its own status
                if (error && typeof error === 'object' && 'statusCode' in error) {
                    throw error;
                }

                console.error('[Avatars] Failed to crop the uploaded image:', error);

                throw createError({
                    statusCode: 400,
                    message: 'Failed to process the avatar image',
                });
            }

            const publish = useBricksPublishAdapter();
            const uploaded = await publish.uploadFile({
                buffer: cropped.buffer,
                mimeType: cropped.mimeType,
                key: buildAvatarKey(publish, sessionUser.id),
            });
            const result = await useBricksAuthAdapter().updateUserProfile(
                sessionUser.id,
                { avatarUrl: uploaded.url },
                sessionUser.authVersion
            );

            // There is no live account with these credentials any more: it was
            // deleted, deactivated or had its password reset while sharp and the
            // upload were running. The write CERTAINLY did not happen (the
            // generation condition did not match), so the file is removed —
            // nothing is left to reference it — and the answer is 401: the
            // session is dead.
            //
            // Every other write failure KEEPS the file: its outcome is unknown —
            // `withTransaction` wraps a cancellation by the server statement
            // timeout the same way for an UPDATE and for a COMMIT, and a
            // canceled COMMIT may already have written the WAL. Deleting the
            // file on such a failure would pull the object out from under an
            // already committed link, that is, trade invisible garbage for an
            // empty square in the corner of the screen
            if (!result) {
                await discardAvatarFile(publish, uploaded.url);

                throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
            }

            await discardAvatarFile(publish, result.previousAvatarUrl);

            return { user: toAuthProfileUser(result.user) };
        });
    } catch (error: unknown) {
        toHttpError(error, 'Failed to upload avatar');
    }
});
