/**
 * Sniffing a file's format by its magic bytes: the MIME and the extension from the
 * multipart are not trusted — the content's class (a raster image / an SVG / a video)
 * is confirmed by its signature before it is passed on to sharp or to storage.
 */

/** The raster and vector formats recognizable by their content. */
export type TSniffedImageFormat =
    | 'jpeg'
    | 'png'
    | 'gif'
    | 'webp'
    | 'tiff'
    | 'bmp'
    | 'avif'
    | 'heif'
    | 'svg';

/** The video containers recognizable by their content. */
export type TSniffedVideoFormat = 'mp4' | 'webm' | 'ogg' | 'avi';

/** How many bytes of the file's head to decode for the textual SVG heuristic. */
const SVG_SNIFF_BYTES = 4096;

/**
 * An XML prolog/comments/DOCTYPE ahead of the root `<svg` (a BOM and whitespace are
 * allowed).
 */
const SVG_LEAD_PATTERN =
    /^\uFEFF?\s*(?:(?:<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)\s*)*<svg[\s>/]/i;

/**
 * The ISO-BMFF (`ftyp`) brands that mean an image (HEIC/HEIF/AVIF) rather than a
 * video, split into the ones telling AVIF from the rest of HEIF. The split matters
 * because the file's fate on an "as is" upload depends on it: a browser shows an AVIF
 * itself, a HEIC it does not, and the latter must be re-encoded.
 */
const AVIF_IMAGE_BRANDS = new Set(['avif', 'avis']);
const HEIF_IMAGE_BRANDS = new Set([
    'heic',
    'heix',
    'hevc',
    'heim',
    'heis',
    'hevm',
    'hevs',
    'mif1',
    'msf1',
    ...AVIF_IMAGE_BRANDS,
]);

/**
 * Matches the buffer's bytes against the expected signature at an offset.
 *
 * @param buffer - The buffer being checked.
 * @param offset - The offset of the signature's start.
 * @param bytes - The expected bytes.
 */
function hasBytes(buffer: Buffer, offset: number, bytes: number[]): boolean {
    if (buffer.length < offset + bytes.length) {
        return false;
    }

    return bytes.every((byte, index) => buffer[offset + index] === byte);
}

/**
 * Matches the buffer's bytes against an ASCII string at an offset.
 *
 * @param buffer - The buffer being checked.
 * @param offset - The offset of the string's start.
 * @param text - The expected ASCII string.
 */
function hasAscii(buffer: Buffer, offset: number, text: string): boolean {
    if (buffer.length < offset + text.length) {
        return false;
    }

    return buffer.toString('latin1', offset, offset + text.length) === text;
}

/**
 * Returns the major brand of an ISO-BMFF container (MP4/MOV/HEIF), or null when the
 * buffer does not start with an `ftyp` box.
 *
 * @param buffer - The buffer being checked.
 */
function readFtypBrand(buffer: Buffer): string | null {
    if (buffer.length < 12 || !hasAscii(buffer, 4, 'ftyp')) {
        return null;
    }

    return buffer.toString('latin1', 8, 12).trim().toLowerCase();
}

/**
 * The textual SVG heuristic: after a BOM/prolog/comments/DOCTYPE the content starts
 * with the root tag `<svg`.
 *
 * @param content - The file's head as text.
 */
export function looksLikeSvgMarkup(content: string): boolean {
    return SVG_LEAD_PATTERN.test(content);
}

/**
 * Decides an image's format by its content's signature.
 *
 * @param buffer - The file's bytes.
 * @returns The format, or null when the content is not a supported image.
 */
export function sniffImageFormat(buffer: Buffer): TSniffedImageFormat | null {
    if (hasBytes(buffer, 0, [0xff, 0xd8, 0xff])) {
        return 'jpeg';
    }

    if (hasBytes(buffer, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
        return 'png';
    }

    if (hasAscii(buffer, 0, 'GIF8')) {
        return 'gif';
    }

    if (hasAscii(buffer, 0, 'RIFF') && hasAscii(buffer, 8, 'WEBP')) {
        return 'webp';
    }

    if (
        hasBytes(buffer, 0, [0x49, 0x49, 0x2a, 0x00]) ||
        hasBytes(buffer, 0, [0x4d, 0x4d, 0x00, 0x2a])
    ) {
        return 'tiff';
    }

    if (hasAscii(buffer, 0, 'BM')) {
        return 'bmp';
    }

    const brand = readFtypBrand(buffer);

    if (brand && AVIF_IMAGE_BRANDS.has(brand)) {
        return 'avif';
    }

    if (brand && HEIF_IMAGE_BRANDS.has(brand)) {
        return 'heif';
    }

    if (looksLikeSvgMarkup(buffer.toString('utf8', 0, Math.min(buffer.length, SVG_SNIFF_BYTES)))) {
        return 'svg';
    }

    return null;
}

/**
 * Decides a video container by its content's signature. ISO-BMFF containers with an
 * image brand (HEIC/AVIF) do not count as a video.
 *
 * @param buffer - The file's bytes.
 * @returns The format, or null when the content is not a supported video.
 */
export function sniffVideoFormat(buffer: Buffer): TSniffedVideoFormat | null {
    const brand = readFtypBrand(buffer);

    if (brand && !HEIF_IMAGE_BRANDS.has(brand)) {
        return 'mp4';
    }

    if (hasBytes(buffer, 0, [0x1a, 0x45, 0xdf, 0xa3])) {
        return 'webm';
    }

    if (hasAscii(buffer, 0, 'OggS')) {
        return 'ogg';
    }

    if (hasAscii(buffer, 0, 'RIFF') && hasAscii(buffer, 8, 'AVI ')) {
        return 'avi';
    }

    return null;
}
