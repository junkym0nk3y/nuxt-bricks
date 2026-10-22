// #region Imports
import { createError } from 'h3';
import sharp from 'sharp';
import type { IImageCropFrame, IImageDimensions, IOptimizedImage } from '../../types/media';
import type { IBricksMediaOptimization } from '../../../common/types/media';
import { createConcurrencyGate, GateOverflowError } from './concurrencyGate';
// #endregion

// #region Data
/**
 * The pixel ceiling of an input image (protection against decompression bombs):
 * 100 MP covers any real photo and is ~2.7 times below the sharp default.
 */
const MAX_INPUT_PIXELS = 100_000_000;
/** The cap on simultaneous sharp conversions (decoding holds memory/CPU). */
const SHARP_MAX_CONCURRENT = 4;
/** The cap on conversions waiting for a slot; above it — 503. */
const SHARP_MAX_QUEUE = 32;
const sharpGate = createConcurrencyGate({
    maxConcurrent: SHARP_MAX_CONCURRENT,
    maxQueue: SHARP_MAX_QUEUE,
});
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
/**
 * The formats a browser must display on its own — and "Original" only
 * makes sense for those.
 *
 * We accept more (HEIC/HEIF, TIFF, BMP), but storing such an input as it is
 * would end with progressive loading replacing a working preview by a file that
 * cannot be opened: the variants are generated in webp and are visible, while the
 * full one is not. For these inputs the conversion stays mandatory even when
 * "Original" is requested.
 */
const WEB_SAFE_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'svg']);
/** MIME by extension for the files stored without re-encoding. */
const IMAGE_EXTENSION_MIME: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    avif: 'image/avif',
    gif: 'image/gif',
};
const SUPPORTED_VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv']);
/**
 * MIME by container. `m4v` is here even though the list of accepted extensions
 * has none: the same ISO-BMFF allows it as the name of a target file, and without
 * a row in this map such a file's MIME was taken from the client header — that is,
 * an arbitrary string went into the record instead of the type derived from the
 * content.
 */
const VIDEO_EXTENSION_MIME: Record<string, string> = {
    mp4: 'video/mp4',
    m4v: 'video/x-m4v',
    webm: 'video/webm',
    ogg: 'video/ogg',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    mkv: 'video/x-matroska',
};
// #endregion

// #region Helpers
/**
 * Returns the file extension in lower case without the dot, or an empty string
 * when there is none.
 * @param filename The file name.
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
 * Normalizes the uploaded file's data into a Buffer.
 * @param data The data from multipart.
 */
export function toBuffer(data: Buffer | string): Buffer {
    return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

/**
 * Decides that a file is an SVG, by MIME or by extension.
 * @param fileType The MIME from the upload.
 * @param extension The extension in lower case.
 */
export function isSvgFile(fileType: string | undefined, extension: string): boolean {
    return fileType === 'image/svg+xml' || extension === 'svg';
}

/**
 * Checks that the uploaded content is an image (MIME or a known extension).
 * @param fileType The MIME from the upload.
 * @param extension The extension in lower case.
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
 * Checks that the uploaded content is a video (MIME or a known extension).
 * @param fileType The MIME from the upload.
 * @param extension The extension in lower case.
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
 * Decides a video file's MIME by its extension.
 * @param extension The extension in lower case.
 * @param fallbackType The MIME from the upload.
 */
export function resolveVideoMime(extension: string, fallbackType?: string): string {
    return VIDEO_EXTENSION_MIME[extension] ?? fallbackType ?? 'video/mp4';
}

/**
 * Whether the input may be stored as it is when "Original" was requested.
 *
 * @param extension The input file's extension in lower case.
 * @returns true — the format is web-safe and re-encoding is not mandatory.
 */
export function isWebSafeImageExtension(extension: string): boolean {
    return WEB_SAFE_IMAGE_EXTENSIONS.has(extension);
}

/**
 * Turns an overflow of the sharp semaphore's queue into a 503 and rethrows
 * everything else as it is.
 *
 * @param error The caught error.
 */
function rethrowSharpGateOverflow(error: unknown): never {
    if (error instanceof GateOverflowError) {
        throw createError({
            statusCode: 503,
            statusMessage: 'Server is busy processing images, try again later',
        });
    }

    throw error;
}

/**
 * Decides whether the input is animated (a GIF/WebP with several frames).
 *
 * Needed because sharp takes the FIRST frame by default: optimizing an animated
 * gif would silently turn it into a static picture. Such an input is stored as it
 * is, and its variants stay static — that is visible and explainable, unlike lost
 * animation.
 *
 * @param buffer The image's source bytes.
 * @returns true — there is more than one frame.
 */
export async function isAnimatedImage(buffer: Buffer): Promise<boolean> {
    try {
        const metadata = await sharpGate.run(() =>
            sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()
        );

        return (metadata.pages ?? 1) > 1;
    } catch (error) {
        if (error instanceof GateOverflowError) {
            rethrowSharpGateOverflow(error);
        }

        // Unreadable metadata is no reason to refuse the upload: treat the
        // input as static, the conversion itself will check it further on anyway
        console.warn('[Media] Failed to read image metadata:', error);

        return false;
    }
}

/**
 * Resizes the source (never enlarging) and encodes it into webp.
 *
 * There is no format among the parameters: the project has one re-encoding —
 * webp. A second target format would exist only for the sake of a choice in the
 * popover, and even then the variants (`preview`/`mock`) would not need it — they
 * are always webp.
 *
 * Decoding is bounded by MAX_INPUT_PIXELS (decompression bombs) and by the shared
 * concurrency semaphore; an overflow of the semaphore's queue is a 503.
 *
 * @param buffer The image's source bytes.
 * @param optimization The resize and the quality.
 * @returns The finished bytes, MIME, extension and the result's dimensions.
 */
export async function optimizeImage(
    buffer: Buffer,
    optimization: Omit<IBricksMediaOptimization, 'format'>
): Promise<IOptimizedImage> {
    try {
        const encoded = sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
            .resize({
                width: optimization.maxWidth,
                fit: 'inside',
                withoutEnlargement: true,
            })
            .webp({ quality: optimization.quality });
        const { data, info } = await sharpGate.run(() =>
            encoded.toBuffer({ resolveWithObject: true })
        );

        return {
            buffer: data,
            mimeType: 'image/webp',
            extension: 'webp',
            width: info.width ?? null,
            height: info.height ?? null,
        };
    } catch (error) {
        rethrowSharpGateOverflow(error);
    }
}

/**
 * Reads the input's dimensions WITH THE EXIF ORIENTATION APPLIED — the ones the
 * browser sees the image in (it applies the orientation itself).
 *
 * Cropping needs them: the frame is drawn by a person over the picture on screen,
 * while `metadata()` returns the dimensions before the rotation. Match the frame
 * against those and for a photo shot rotated the bounds check would be computed
 * over swapped sides: a legitimate frame would be rejected as out of bounds, and
 * an invalid one would make it into `extract`, which would then refuse with an
 * error of its own.
 *
 * @param buffer The image's source bytes.
 * @returns The dimensions, or null — sharp could not determine them (the input is
 * not a raster).
 */
export async function readOrientedImageDimensions(
    buffer: Buffer
): Promise<IImageDimensions | null> {
    try {
        const metadata = await sharpGate.run(() =>
            sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()
        );
        const { width, height } = metadata.autoOrient;

        return width && height ? { width, height } : null;
    } catch (error) {
        if (error instanceof GateOverflowError) {
            rethrowSharpGateOverflow(error);
        }

        console.warn('[Media] Failed to read oriented image dimensions:', error);

        return null;
    }
}

/**
 * Cuts a square out along the frame and encodes it into webp of a given side.
 *
 * The order of operations rests on `autoOrient` being an INPUT option (sharp
 * applies it while decoding), so `extract` works in the same coordinates the
 * person drawing the frame saw.
 *
 * The result is one file for every display size: an avatar is shown at 36 pixels
 * at most in the corner and up to a hundred in the profile, and a set of variants
 * for that would mean three objects in storage and three links in the column
 * instead of one. Enlarging a small frame up to the target side is deliberately
 * not forbidden: otherwise some avatars would be smaller than the rest, and the
 * corner of the screen would "jump".
 *
 * The caller must check the frame's bounds (see
 * `readOrientedImageDimensions`): out of bounds `extract` refuses with an error of
 * its own, which goes to the client as a 400 "failed to process" instead of a clear
 * "the frame is outside the image".
 *
 * @param buffer The image's source bytes.
 * @param frame The square frame in the oriented image's coordinates.
 * @param size The result's side in pixels.
 * @param quality The webp encoding quality.
 * @returns The finished bytes, MIME, extension and the result's dimensions.
 */
export async function cropSquareImage(
    buffer: Buffer,
    frame: IImageCropFrame,
    size: number,
    quality: number
): Promise<IOptimizedImage> {
    try {
        const encoded = sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
            .autoOrient()
            .extract({
                left: frame.left,
                top: frame.top,
                width: frame.side,
                height: frame.side,
            })
            .resize({ width: size, height: size, fit: 'cover' })
            .webp({ quality });
        const { data, info } = await sharpGate.run(() =>
            encoded.toBuffer({ resolveWithObject: true })
        );

        return {
            buffer: data,
            mimeType: 'image/webp',
            extension: 'webp',
            width: info.width ?? null,
            height: info.height ?? null,
        };
    } catch (error) {
        rethrowSharpGateOverflow(error);
    }
}

/**
 * Reads the pixel dimensions of a file stored without re-encoding.
 * null — sharp could not determine them (an SVG with no size attributes
 * included).
 *
 * @param buffer The image's source bytes.
 */
export async function readImageDimensions(
    buffer: Buffer
): Promise<{ width: number | null; height: number | null }> {
    try {
        const metadata = await sharpGate.run(() =>
            sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()
        );

        return { width: metadata.width ?? null, height: metadata.height ?? null };
    } catch (error) {
        if (error instanceof GateOverflowError) {
            rethrowSharpGateOverflow(error);
        }

        console.warn('[Media] Failed to read image dimensions:', error);

        return { width: null, height: null };
    }
}

/**
 * The MIME of a file stored without re-encoding.
 *
 * @param extension The extension in lower case.
 * @param fallbackType The MIME from the upload.
 */
export function resolveImageMime(extension: string, fallbackType?: string): string {
    return IMAGE_EXTENSION_MIME[extension] ?? fallbackType ?? 'image/png';
}
// #endregion
