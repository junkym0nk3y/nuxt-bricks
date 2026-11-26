/**
 * The ingress of a canvas snapshot: the checks of the uploaded frame and its re-encoding
 * into a preview.
 *
 * Shared by the two thumbnail endpoints — of a page and of a template. They differ in
 * where the file goes and who points at it afterwards, while the frame is the same
 * canvas snapshot: one set of bounds keeps the two doors equally narrow, and a second
 * copy would drift away from the first at the very first edit.
 */
import { createError } from 'h3';
import type { IOptimizedImage, IUploadedFilePart } from '../../types/media';

// Utils
import { sniffImageFormat } from './fileSignatures';
import { optimizeImage, toBuffer } from './imageProcessing';
import { MULTIPART_ENVELOPE_ALLOWANCE_BYTES } from './multipartStream';

/** Target width of a preview (px) */
const THUMBNAIL_WIDTH = 480;

/** Quality of the preview webp encoding */
const THUMBNAIL_WEBP_QUALITY = 80;

/** Maximum size of the incoming snapshot (MB) — a canvas snapshot must not weigh more */
const MAX_THUMBNAIL_UPLOAD_MB = 10;

/** The ceiling of the whole multipart body: the snapshot plus the envelope of the form */
export const THUMBNAIL_BODY_LIMIT_BYTES =
    MAX_THUMBNAIL_UPLOAD_MB * 1024 * 1024 + MULTIPART_ENVELOPE_ALLOWANCE_BYTES;

/** Limit of snapshots from one IP per minute, per endpoint */
export const THUMBNAILS_PER_MINUTE = 30;

/**
 * Pulls the snapshot file out of the multipart form and validates that it carries data,
 * fits the size limit and has a raster signature (a canvas snapshot is always a raster
 * image; an SVG would bring markup into the interface).
 *
 * @param formData - Collection of multipart fields.
 * @returns The file that was found.
 */
export function assertUploadedThumbnail(formData: IUploadedFilePart[]): IUploadedFilePart {
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
 * Re-encodes a checked snapshot into the preview: a webp at most 480px wide, through
 * the shared sharp semaphore with `limitInputPixels`.
 *
 * @param file - The snapshot that passed `assertUploadedThumbnail`.
 * @returns The encoded preview.
 */
export function optimizeThumbnail(file: IUploadedFilePart): Promise<IOptimizedImage> {
    return optimizeImage(toBuffer(file.data), {
        maxWidth: THUMBNAIL_WIDTH,
        quality: THUMBNAIL_WEBP_QUALITY,
    });
}
