// #region Imports
import { createError } from 'h3';
import type {
    IOptimizedImage,
    IUploadedFilePart,
    IValidatedImage,
    IValidatedVideoUpload,
    TMediaVariant,
} from '../../types/media';
import type { IBricksMediaOptimization } from '../../../common/types/media';
import {
    looksLikeSvgMarkup,
    sniffImageFormat,
    sniffVideoFormat,
    type TSniffedImageFormat,
} from './fileSignatures';
import { SNIFFED_FORMAT_EXTENSIONS } from './mediaFormats';
import {
    getFileExtension,
    isAnimatedImage,
    isImageFile,
    isSvgFile,
    isVideoFile,
    isWebSafeImageExtension,
    optimizeImage,
    readImageDimensions,
    resolveImageMime,
    resolveVideoMime,
    toBuffer,
} from './imageProcessing';
import { MEDIA_VARIANT_PRESETS } from './mediaVariants';
// #endregion

// #region Constants
/** ISO-BMFF containers: one signature, different extensions (`mp4`, `mov`, `m4v`). */
const ISO_BMFF_EXTENSIONS = new Set(['mp4', 'mov', 'm4v']);
/**
 * The formats that can have more than one frame.
 *
 * The animation check is a separate sharp pass over the metadata, that is, one
 * more slot of the shared semaphore per upload. For JPEG and PNG the result is
 * known in advance to be "one frame", so there is nothing to ask about them:
 * without this list an ordinary photo upload took two slots instead of one.
 */
const ANIMATABLE_SNIFFED_FORMATS = new Set<TSniffedImageFormat>(['gif', 'webp', 'avif']);

/**
 * The length ceiling of the declared Content-Type — exactly the `mime_type`
 * column (`VARCHAR(255)`) in `bricks_media`.
 */
const MIME_TYPE_MAX_LENGTH = 255;

/** How many bytes of the file's head to decode for the textual SVG check. */
const SVG_SNIFF_BYTES = 4096;
// #endregion

/**
 * Rejects a declared Content-Type that will not fit into the `mime_type` column.
 *
 * The check runs BEFORE the file is processed: where the MIME cannot be derived
 * from the content (rare video containers) it goes into the record as it is, and
 * without the bound a long Content-Type passed validation, took up room in the
 * bucket and failed at the insert — the user got a generic 500 instead of a clear
 * refusal, and sharp and the upload were done for nothing.
 *
 * @param fileType The MIME from the upload.
 */
function assertDeclaredMimeType(fileType: string | undefined): void {
    if (fileType && fileType.length > MIME_TYPE_MAX_LENGTH) {
        throw createError({
            statusCode: 400,
            message: `Declared content type is longer than ${MIME_TYPE_MAX_LENGTH} characters`,
        });
    }
}

/**
 * Checks that the content is SVG markup (a textual heuristic over the root tag).
 * The MIME and the extension are not trusted: anyone can declare
 * `image/svg+xml`.
 *
 * @param fileBuffer The file's bytes.
 */
function assertSvgContent(fileBuffer: Buffer): void {
    const head = fileBuffer.toString('utf8', 0, Math.min(fileBuffer.length, SVG_SNIFF_BYTES));

    if (!looksLikeSvgMarkup(head)) {
        throw createError({
            statusCode: 400,
            message: 'File content is not a valid SVG image',
        });
    }
}

/**
 * Confirms raster content by the signature of a known format and returns that
 * format. The return is non-nullable: an unrecognized format is a refusal, not
 * "probably an SVG" (the previous signature allowed null, and the "did not
 * recognize" branch read as the vector one).
 *
 * @param fileBuffer The file's bytes.
 */
function assertRasterContentSignature(fileBuffer: Buffer): TSniffedImageFormat {
    const sniffed = sniffImageFormat(fileBuffer);

    if (!sniffed || sniffed === 'svg') {
        throw createError({
            statusCode: 400,
            message: 'File content is not a supported image',
        });
    }

    return sniffed;
}

/**
 * Generates the downscaled variants for progressive loading.
 *
 * The variants are always webp regardless of the full file's format: their job is
 * to show up in any browser before the full one arrives, and tying them to the
 * chosen format (at the limit — to "Original" in HEIC) would mean losing the
 * whole point. A single variant failing does not bring the upload down: with no
 * variant the consumer plainly shows the full file right away, while with no file
 * there is nothing to show at all.
 *
 * @param buffer The image's source bytes.
 * @returns The finished variants; a missing key — the variant could not be built.
 */
async function buildImageVariants(
    buffer: Buffer
): Promise<Partial<Record<TMediaVariant, IOptimizedImage>>> {
    const variants: Partial<Record<TMediaVariant, IOptimizedImage>> = {};

    for (const variant of Object.keys(MEDIA_VARIANT_PRESETS) as TMediaVariant[]) {
        try {
            variants[variant] = await optimizeImage(buffer, MEDIA_VARIANT_PRESETS[variant]);
        } catch (error) {
            // The 503 of a busy semaphore is rethrown: the server is overloaded,
            // and the full file will not make it through the same path either
            if (error && typeof error === 'object' && 'statusCode' in error) {
                throw error;
            }

            console.warn(`[Media Upload] Failed to build "${variant}" variant:`, error);
        }
    }

    return variants;
}

/**
 * Prepares the full file: re-encodes into the chosen format or stores it as it is.
 *
 * "As it is" covers two cases here: a requested "Original" over a web-safe input
 * and animation (sharp would take the first frame, that is, would silently kill
 * the animation). A non-web-safe input is converted even when "Original" is
 * requested — otherwise progressive loading would replace the visible webp
 * preview by a file the browser will not open. SVG never reaches this function:
 * a vector is not subject to raster processing and leaves through a branch of its
 * own in `validateAndOptimizeImage`.
 *
 * @param buffer The image's source bytes.
 * @param sniffedFormat The raster format confirmed by the content's signature.
 * @param optimization The optimization settings.
 * @returns The full file's bytes with its MIME, extension and dimensions.
 */
async function prepareFullImage(
    buffer: Buffer,
    sniffedFormat: TSniffedImageFormat,
    optimization: IBricksMediaOptimization
): Promise<IOptimizedImage> {
    // The extension and the MIME are derived from the CONTENT rather than from
    // the file name: the name comes from the client, and a PNG named `photo.gif`
    // would be stored as `*.gif` with `image/gif` — while we did check the
    // signature and threw the result away
    const extension = SNIFFED_FORMAT_EXTENSIONS[sniffedFormat];
    const isWebSafe = Boolean(extension) && isWebSafeImageExtension(extension);
    const keepAsIs =
        isWebSafe &&
        (optimization.format === 'original' ||
            (ANIMATABLE_SNIFFED_FORMATS.has(sniffedFormat) && (await isAnimatedImage(buffer))));

    if (keepAsIs) {
        const { width, height } = await readImageDimensions(buffer);

        return {
            buffer,
            mimeType: resolveImageMime(extension),
            extension,
            width,
            height,
        };
    }

    // 'original' only reaches here for a non-web-safe input: the conversion is
    // mandatory, and the project has one re-encoding — webp
    return optimizeImage(buffer, {
        quality: optimization.quality,
        maxWidth: optimization.maxWidth,
    });
}

/**
 * Validates the type/size/signature, prepares the full file and the downscaled
 * variants (an SVG is left alone — neither optimization nor variants).
 *
 * @param file The uploaded multipart file.
 * @param maxUploadSizeBytes The size limit in bytes.
 * @param maxUploadSizeMb The limit in megabytes (for the message).
 * @param optimization The optimization settings.
 */
export async function validateAndOptimizeImage(
    file: IUploadedFilePart,
    maxUploadSizeBytes: number,
    maxUploadSizeMb: number,
    optimization: IBricksMediaOptimization
): Promise<IValidatedImage> {
    const originalExtension = getFileExtension(file.filename);
    const fileBuffer = toBuffer(file.data);

    assertDeclaredMimeType(file.type);

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

    if (isSvgFile(file.type, originalExtension)) {
        assertSvgContent(fileBuffer);

        return {
            optimizedBuffer: fileBuffer,
            // The MIME and the extension are canonical rather than taken from
            // the request: the content has already been confirmed as SVG markup,
            // so the type is known for certain. From the client values an
            // arbitrary string used to arrive here — both a MIME longer than the
            // `mime_type` column and an extension of a foreign format, because of
            // which a valid SVG went into the bucket as `uuid.png` and the bucket
            // import then recognized it as a PNG
            mimeType: 'image/svg+xml',
            targetExtension: 'svg',
            isSvg: true,
            width: null,
            height: null,
            variants: {},
        };
    }

    // The signature is checked before the try: its refusal is an INPUT refusal
    // with a text of its own, and there is no reason for it to land in the shared
    // "failed to optimize" catch
    const sniffedFormat = assertRasterContentSignature(fileBuffer);

    try {
        const full = await prepareFullImage(fileBuffer, sniffedFormat, optimization);

        return {
            optimizedBuffer: full.buffer,
            mimeType: full.mimeType,
            targetExtension: full.extension,
            isSvg: false,
            width: full.width,
            height: full.height,
            variants: await buildImageVariants(fileBuffer),
        };
    } catch (error) {
        // h3 errors (the 503 of a busy semaphore) are rethrown with their own status
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
 * Validates a video upload by its declared type and the HEAD of its content, and
 * decides what it will be stored as.
 *
 * The head is enough because a video is not processed at all: the container is
 * read off the first bytes and the file travels to storage as a stream. The size
 * ceiling is therefore not checked here — it is the business of whoever pipes the
 * bytes, and it has to be checked as they arrive rather than over a buffer nobody
 * assembles any more.
 *
 * @param file The declared type and name of the uploaded part.
 * @param head The first bytes of the content (12 are enough for every container).
 */
export function validateVideoUpload(
    file: Pick<IUploadedFilePart, 'type' | 'filename'>,
    head: Buffer
): IValidatedVideoUpload {
    const extension = getFileExtension(file.filename);

    assertDeclaredMimeType(file.type);

    if (!isVideoFile(file.type, extension)) {
        throw createError({
            statusCode: 400,
            message: 'Unsupported video format',
        });
    }

    const sniffedFormat = sniffVideoFormat(head);

    if (!sniffedFormat) {
        throw createError({
            statusCode: 400,
            message: 'File content is not a supported video',
        });
    }

    // The container is taken from the content rather than from the name: a WebM
    // named `clip.mp4` went into the bucket as `*.mp4` with `video/mp4`, and the
    // player got a Content-Type not matching the bytes. `mov` is the same ISO-BMFF
    // as mp4, and they cannot be told apart by their signature, so the name is
    // respected inside one group of containers
    const targetExtension =
        sniffedFormat === 'mp4' && ISO_BMFF_EXTENSIONS.has(extension) ? extension : sniffedFormat;
    const mimeType = resolveVideoMime(targetExtension, file.type);

    return { mimeType, targetExtension };
}
