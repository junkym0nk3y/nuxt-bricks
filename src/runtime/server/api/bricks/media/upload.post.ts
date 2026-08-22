import { randomUUID } from 'crypto';
import { createError, defineEventHandler } from 'h3';
import {
    useBricksPublishAdapter,
    useBricksStorageAdapter,
} from '../../../../modules/persistence/server/registry';
import {
    getFileExtension,
    isVideoFile,
} from '../../../../modules/persistence/server/utils/imageProcessing';
import {
    resolveMediaConfig,
    resolveRequestedOptimization,
} from '../../../../modules/persistence/server/utils/mediaConfig';
import {
    validateAndOptimizeImage,
    validateVideo,
} from '../../../../modules/persistence/server/utils/mediaProcessing';
import { uploadAndRegisterMedia } from '../../../../modules/persistence/server/utils/mediaOrchestration';
import { buildMediaVariantFilename } from '../../../../modules/persistence/server/utils/mediaVariants';
import { toMediaHttpError } from '../../../../modules/persistence/server/utils/handlerHelpers';
import {
    MULTIPART_ENVELOPE_ALLOWANCE_BYTES,
    withMultipartFormData,
} from '../../../../modules/persistence/server/utils/requestBodyLimits';
import { validateMediaCategory } from '../../../../modules/persistence/server/utils/mediaPayloadValidation';
import { assertKnownMediaCategory } from '../../../../modules/persistence/server/utils/mediaCategoryRules';
import { sanitizeSvgMarkup } from '../../../../modules/common/utils/sanitize/sanitizeSvg';
import {
    assertWithinRateLimit,
    createFixedWindowRateLimiter,
} from '../../../utils/requestRateLimiter';
import type {
    IPreparedUpload,
    IResolvedMediaConfig,
    IUploadedFilePart,
    IUploadMediaVariant,
    IValidatedImage,
    TMediaVariant,
} from '../../../../modules/persistence/types/media';
import type { IBricksMediaOptimization } from '../../../../modules/common/types/media';

/** Limit of uploads from one IP per minute */
const UPLOADS_PER_MINUTE = 30;
const uploadRateLimiter = createFixedWindowRateLimiter({
    limit: UPLOADS_PER_MINUTE,
    windowMs: 60_000,
});

/**
 * Reads the optimization overrides out of the multipart fields and merges them
 * over the config defaults.
 *
 * The parameters arrive with the form rather than from the config, because they
 * are picked in a popover on every upload; the config stays the source of the
 * defaults. Parsing, default substitution and the bounds are kept by
 * `resolveRequestedOptimization` — all that is left here is pulling out the
 * strings, because telling "the field was absent" from "something unusable
 * arrived" is the duty of whoever applies the bounds.
 *
 * @param formData - Collection of multipart fields.
 * @param fallback - Parameters from the config.
 * @returns The effective optimization parameters.
 */
function resolveUploadOptimization(
    formData: IUploadedFilePart[],
    fallback: IBricksMediaOptimization
): IBricksMediaOptimization {
    const readField = (name: string): string | undefined =>
        formData.find((item) => item.name === name)?.data.toString();

    return resolveRequestedOptimization(
        {
            format: readField('format'),
            quality: readField('quality'),
            maxWidth: readField('maxWidth'),
        },
        fallback
    );
}

/**
 * Completes the variants with object names next to the full file.
 *
 * @param variants - Ready bytes of the variants.
 * @param storedFilename - Object name of the full file.
 * @returns The variants carrying object names.
 */
function withVariantFilenames(
    variants: IValidatedImage['variants'],
    storedFilename: string
): Partial<Record<TMediaVariant, IUploadMediaVariant>> {
    const result: Partial<Record<TMediaVariant, IUploadMediaVariant>> = {};

    for (const [variant, image] of Object.entries(variants) as [
        TMediaVariant,
        NonNullable<IValidatedImage['variants'][TMediaVariant]>,
    ][]) {
        result[variant] = {
            buffer: image.buffer,
            mimeType: image.mimeType,
            storedFilename: buildMediaVariantFilename(storedFilename, variant, image.extension),
        };
    }

    return result;
}

/**
 * Pulls the file out of the multipart form and validates that it carries data.
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

    return file;
}

/**
 * Validates a file and prepares it for upload: a video as it is, an image
 * optimized into the chosen format plus the downscaled variants, an SVG as
 * sanitized markup for the preview.
 *
 * @param file - Multipart file.
 * @param config - Resolved media settings (limits, optimization).
 * @param optimization - Effective optimization parameters (config plus form).
 * @returns Buffer, MIME type, extension, svgContent, dimensions and variants.
 */
export async function prepareUpload(
    file: IUploadedFilePart,
    config: IResolvedMediaConfig,
    optimization: IBricksMediaOptimization = config.optimization
): Promise<IPreparedUpload> {
    const fileExtension = getFileExtension(file.filename);

    if (isVideoFile(file.type, fileExtension)) {
        const validated = validateVideo(
            file,
            config.maxVideoUploadSizeBytes,
            config.maxVideoUploadSizeMb
        );

        return {
            buffer: validated.buffer,
            mimeType: validated.mimeType,
            targetExtension: validated.targetExtension,
            svgContent: null,
            width: null,
            height: null,
            variants: {},
        };
    }

    const validated = await validateAndOptimizeImage(
        file,
        config.maxUploadSizeBytes,
        config.maxUploadSizeMb,
        optimization
    );

    if (!validated.isSvg) {
        return {
            buffer: validated.optimizedBuffer,
            mimeType: validated.mimeType,
            targetExtension: validated.targetExtension,
            svgContent: null,
            width: validated.width,
            height: validated.height,
            variants: validated.variants,
        };
    }

    // An inline SVG is untrusted input: one and the same sanitized buffer goes
    // into the database and into the bucket (previously the original, unchecked
    // one flew to S3)
    const sanitizedSvg = sanitizeSvgMarkup(validated.optimizedBuffer.toString('utf8'));

    return {
        buffer: Buffer.from(sanitizedSvg, 'utf8'),
        mimeType: validated.mimeType,
        targetExtension: validated.targetExtension,
        svgContent: sanitizedSvg,
        width: null,
        height: null,
        variants: {},
    };
}

/**
 * POST /api/bricks/media/upload — the upload of media in one request: the file
 * into the publication storage plus the metadata record in the database.
 *
 * The two writes are not one transaction, and what happens to the file when the
 * second one fails depends on WHAT is known about its outcome — a guaranteed
 * refusal is compensated by deleting the file, an unknown outcome is retried once
 * and then keeps the file. The rule and the defect behind it live with
 * `uploadAndRegisterMedia`; do not restate it here.
 *
 * Ingress control: a rate limit by IP, the body is read under a hard limit (a
 * Content-Length pre-check plus a stream limit) and within the shared budget of
 * simultaneously buffered forms — the per-minute limit does not bound the number
 * of SIMULTANEOUS uploads, and the body of each is assembled in memory in full.
 * The content of the file is confirmed by magic bytes in the validate* helpers;
 * they also check the size ceiling of each type — before the form is parsed the
 * type of the file is unknown.
 *
 * Multipart fields: `file` (mandatory), `category` (optional — an absent field
 * and an empty value both mean a file with no category, `null`),
 * `format` / `quality` / `maxWidth` (optional — they override the
 * `bricks.media.optimization` defaults for this upload).
 */
export default defineEventHandler(async (event) => {
    try {
        assertWithinRateLimit(event, uploadRateLimiter, 'Too many media uploads');

        const config = resolveMediaConfig();
        const bodyLimitBytes =
            Math.max(config.maxUploadSizeBytes, config.maxVideoUploadSizeBytes) +
            MULTIPART_ENVELOPE_ALLOWANCE_BYTES;

        // Everything happens INSIDE the callback because the reservation in the
        // concurrent buffering budget lives exactly as long as it runs — see
        // `withMultipartFormData` for why the form is handed to a callback at all
        return await withMultipartFormData(event, bodyLimitBytes, async (formData) => {
            if (formData.length === 0) {
                throw createError({
                    statusCode: 400,
                    message: 'No file uploaded',
                });
            }

            const file = assertUploadedFile(formData);
            const rawCategory = formData.find((item) => item.name === 'category')?.data.toString();
            // An empty form field and an absent field are one and the same: an
            // upload with no category chosen, and the file stays without one
            const category = rawCategory ? validateMediaCategory(rawCategory) : null;
            const storage = useBricksStorageAdapter();

            // Before the file is processed: there is no point spending sharp and
            // an upload into the bucket on input that has nowhere to be recorded
            // anyway. This check does not close the race with the deletion of a
            // category — that one is caught by the database FK after the upload
            if (category) {
                await assertKnownMediaCategory(storage, category);
            }

            const prepared = await prepareUpload(
                file,
                config,
                resolveUploadOptimization(formData, config.optimization)
            );
            const storedFilename = `${randomUUID()}.${prepared.targetExtension}`;

            return await uploadAndRegisterMedia(
                { storage, publish: useBricksPublishAdapter() },
                {
                    buffer: prepared.buffer,
                    mimeType: prepared.mimeType,
                    storedFilename,
                    displayFilename: file.filename || storedFilename,
                    category,
                    svgContent: prepared.svgContent,
                    width: prepared.width,
                    height: prepared.height,
                    variants: withVariantFilenames(prepared.variants, storedFilename),
                }
            );
        });
    } catch (error: unknown) {
        toMediaHttpError(error, 'Failed to upload media file');
    }
});
