/**
 * The MIME of a file already lying in storage, decided by its content.
 *
 * A separate module from `imageProcessing.ts` on purpose: there the extension
 * has already been confirmed against the signature by the upload validation, so
 * the maps are keyed by extension. Here the name is the only thing known before
 * the file is read, and it is exactly what must not be trusted — the key is the
 * sniffed format, and the extension only gets a say where one signature covers
 * several containers.
 */

// #region Imports
// Utils
import {
    sniffImageFormat,
    sniffVideoFormat,
    type TSniffedImageFormat,
    type TSniffedVideoFormat,
} from './fileSignatures';
import { getFileExtension, isWebSafeImageExtension, resolveVideoMime } from './imageProcessing';
// #endregion

// #region Constants
/**
 * How many bytes of the head are enough to decide the format. The ceiling is set
 * by the textual SVG heuristic (the prolog, the comments and the DOCTYPE may
 * stand ahead of the root tag); every binary signature sits in the first bytes.
 */
export const MEDIA_SNIFF_BYTES = 4096;

/**
 * The size limit of the SVG markup kept in the database for the preview.
 *
 * The limit belongs to the reading side: whoever pulls the content in has to
 * refuse an oversized file rather than store a truncated one — a cut-off SVG is
 * broken markup, and it would go into the record looking valid.
 */
export const MEDIA_SVG_CONTENT_MAX_BYTES = 2 * 1024 * 1024;

/**
 * The extension of an object by its recognized content. HEIF and TIFF/BMP are
 * here even though they are never stored as they are: the value is needed to
 * decide web-safeness by the content rather than by the name.
 */
export const SNIFFED_FORMAT_EXTENSIONS: Record<TSniffedImageFormat, string> = {
    jpeg: 'jpg',
    png: 'png',
    gif: 'gif',
    webp: 'webp',
    avif: 'avif',
    tiff: 'tiff',
    bmp: 'bmp',
    heif: 'heic',
    svg: 'svg',
};

/** The canonical MIME of every image format recognizable by content. */
const IMAGE_FORMAT_MIME: Record<TSniffedImageFormat, string> = {
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    tiff: 'image/tiff',
    bmp: 'image/bmp',
    avif: 'image/avif',
    heif: 'image/heif',
    svg: 'image/svg+xml',
};

/** The canonical MIME of every video container recognizable by content. */
const VIDEO_FORMAT_MIME: Record<TSniffedVideoFormat, string> = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    ogg: 'video/ogg',
    avi: 'video/x-msvideo',
};

/**
 * Extensions a sniffed container may legitimately be named with. One signature
 * covers several containers: an ISO-BMFF head is MP4, M4V and MOV alike, an EBML
 * one is WebM and MKV alike.
 */
const VIDEO_FORMAT_EXTENSIONS: Record<TSniffedVideoFormat, readonly string[]> = {
    mp4: ['mp4', 'm4v', 'mov'],
    webm: ['webm', 'mkv'],
    ogg: ['ogg'],
    avi: ['avi'],
};
// #endregion

/**
 * Decides the MIME of a stored file by the head of its content.
 *
 * The signature decides the format; the name is allowed to tell apart only the
 * containers that share one signature. An extension from another family is
 * ignored — otherwise the name would override the content, which is the very
 * thing the sniffing is here to prevent.
 *
 * @param filename - Name of the file in storage (untrusted).
 * @param head - The first bytes of the file (at least MEDIA_SNIFF_BYTES of a
 * longer one).
 * @returns The MIME, or null when the content is not a supported media file.
 */
export function resolveStoredMediaMime(filename: string, head: Buffer): string | null {
    const imageFormat = sniffImageFormat(head);

    if (imageFormat) {
        // TIFF, BMP and HEIF are refused deliberately, even though an upload
        // accepts them: an upload re-encodes them into webp precisely because a
        // browser does not display them, while an import stores what already lies
        // in the bucket and re-encodes nothing. A record of such a file would take
        // a cell of the library with a broken picture and could be picked into a
        // page — the same defect for the sake of which unrecognized content is
        // skipped
        return isWebSafeImageExtension(SNIFFED_FORMAT_EXTENSIONS[imageFormat])
            ? IMAGE_FORMAT_MIME[imageFormat]
            : null;
    }

    const videoFormat = sniffVideoFormat(head);

    if (!videoFormat) {
        return null;
    }

    const extension = getFileExtension(filename);
    const canRefineByName = VIDEO_FORMAT_EXTENSIONS[videoFormat].includes(extension);

    return canRefineByName
        ? resolveVideoMime(extension, VIDEO_FORMAT_MIME[videoFormat])
        : VIDEO_FORMAT_MIME[videoFormat];
}
