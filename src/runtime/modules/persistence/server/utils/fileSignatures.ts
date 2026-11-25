/**
 * Sniffing a file's format by its magic bytes: the MIME and the extension from the
 * multipart are not trusted — the content's class (a raster image / an SVG / a video /
 * a document) is confirmed by its signature before it is passed on to sharp or to
 * storage.
 */

import type { TMediaDocumentExtension } from '../../../common/types/media';

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

/** `%PDF-` — the header a PDF opens with. */
const PDF_HEADER = '%PDF-';

/** The local file header every zip (and so every DOCX/XLSX) opens with. */
const ZIP_LOCAL_HEADER = [0x50, 0x4b, 0x03, 0x04];

/** Signatures and fixed sizes of the zip central directory. */
const ZIP_END_OF_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_DIRECTORY_ENTRY_SIGNATURE = 0x02014b50;
const ZIP_END_OF_DIRECTORY_SIZE = 22;
const ZIP_DIRECTORY_ENTRY_SIZE = 46;
const ZIP_MAX_COMMENT_SIZE = 0xffff;

/** The part every Office Open XML package carries at its root. */
const OOXML_CONTENT_TYPES_PART = '[Content_Types].xml';

/**
 * The name of the VBA project part: its presence means a macro-enabled document
 * (`docm`/`xlsm`) whatever the file is called.
 */
const OOXML_VBA_PROJECT_PART = 'vbaproject.bin';

/**
 * The folder of Excel 4.0 macro sheets: formulas that run on opening, with no VBA
 * project anywhere in the package.
 */
const OOXML_MACRO_SHEETS_FOLDER = 'xl/macrosheets/';

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

/**
 * Reads the entry names of a zip out of its central directory.
 *
 * The directory rather than the local headers: a local header may carry zero sizes
 * (streamed writers put them into a data descriptor after the data), so walking them
 * forward is not reliable, while the directory at the end of the file lists every
 * entry with its name. The end record is looked for from the end backwards — a
 * comment of up to 64 KB may follow it — and the signature bytes alone do not make a
 * record: the comment is free text and may contain them. The record is the one whose
 * own comment length runs exactly to the end of the file, and only that one directory
 * is walked. ZIP64 is not read (its offsets do not fit here): such a document is
 * beyond any upload ceiling anyway.
 *
 * One walk, not one per candidate: trying every signature until a directory came out
 * consistent let a tail packed with forged records — each pointing at a directory of
 * 65 534 entries and promising one more — cost a full walk apiece. A 3 MB upload held
 * the synchronous check, and with it the whole server, for seconds.
 *
 * @param buffer - The whole file.
 * @returns The entry names, or null when the file has no consistent directory.
 */
function readZipEntryNames(buffer: Buffer): string[] | null {
    const lowestOffset = Math.max(
        0,
        buffer.length - ZIP_END_OF_DIRECTORY_SIZE - ZIP_MAX_COMMENT_SIZE
    );

    for (
        let endOffset = buffer.length - ZIP_END_OF_DIRECTORY_SIZE;
        endOffset >= lowestOffset;
        endOffset -= 1
    ) {
        if (buffer.readUInt32LE(endOffset) !== ZIP_END_OF_DIRECTORY_SIGNATURE) {
            continue;
        }

        const commentLength = buffer.readUInt16LE(endOffset + 20);

        if (endOffset + ZIP_END_OF_DIRECTORY_SIZE + commentLength === buffer.length) {
            return readZipDirectory(buffer, endOffset);
        }
    }

    return null;
}

/**
 * Walks the central directory an end record points at.
 *
 * @param buffer - The whole file.
 * @param endOffset - Offset of the end-of-directory record.
 * @returns The entry names, or null when the directory is not consistent.
 */
function readZipDirectory(buffer: Buffer, endOffset: number): string[] | null {
    const entryCount = buffer.readUInt16LE(endOffset + 10);
    const directorySize = buffer.readUInt32LE(endOffset + 12);
    const directoryOffset = buffer.readUInt32LE(endOffset + 16);

    if (directoryOffset + directorySize > endOffset) {
        return null;
    }

    const names: string[] = [];
    let cursor = directoryOffset;

    for (let index = 0; index < entryCount; index += 1) {
        if (
            cursor + ZIP_DIRECTORY_ENTRY_SIZE > endOffset ||
            buffer.readUInt32LE(cursor) !== ZIP_DIRECTORY_ENTRY_SIGNATURE
        ) {
            return null;
        }

        const nameLength = buffer.readUInt16LE(cursor + 28);
        const extraLength = buffer.readUInt16LE(cursor + 30);
        const commentLength = buffer.readUInt16LE(cursor + 32);
        const nameStart = cursor + ZIP_DIRECTORY_ENTRY_SIZE;

        if (nameStart + nameLength > endOffset) {
            return null;
        }

        names.push(buffer.toString('utf8', nameStart, nameStart + nameLength));
        cursor = nameStart + nameLength + extraLength + commentLength;
    }

    return names;
}

/**
 * Decides an Office Open XML document: a zip whose root carries
 * `[Content_Types].xml`, told apart by the folder of its main part.
 *
 * @param buffer - The whole file.
 * @returns `docx`, `xlsx`, or null for any other zip — a presentation, an archive, a
 *   package with a VBA project or with Excel 4.0 macro sheets.
 */
function sniffOfficeOpenXmlFormat(buffer: Buffer): 'docx' | 'xlsx' | null {
    if (!hasBytes(buffer, 0, ZIP_LOCAL_HEADER)) {
        return null;
    }

    const names = readZipEntryNames(buffer);

    if (!names?.includes(OOXML_CONTENT_TYPES_PART)) {
        return null;
    }

    const hasMacros = names.some((name) => {
        const lowerName = name.toLowerCase();

        return (
            lowerName.endsWith(OOXML_VBA_PROJECT_PART) ||
            lowerName.startsWith(OOXML_MACRO_SHEETS_FOLDER)
        );
    });

    if (hasMacros) {
        return null;
    }

    if (names.some((name) => name.startsWith('word/'))) {
        return 'docx';
    }

    return names.some((name) => name.startsWith('xl/')) ? 'xlsx' : null;
}

/**
 * Decides a document's format by its content: PDF by its header, DOCX/XLSX by the zip
 * directory. A document carrying a VBA project or Excel 4.0 macro sheets is not
 * recognized at all, whichever extension it was given; a template fetched over an
 * external link is not looked for. A legacy DOC or XLS is not recognized either: the
 * library does not take them, and the header of `common/constants/mediaDocuments.ts`
 * says why.
 *
 * Needs the WHOLE file: the zip directory sits at its end.
 *
 * @param buffer - The file's bytes.
 * @returns The format (which is also the extension to store the file with), or null.
 */
export function sniffDocumentFormat(buffer: Buffer): TMediaDocumentExtension | null {
    if (hasAscii(buffer, 0, PDF_HEADER)) {
        return 'pdf';
    }

    return sniffOfficeOpenXmlFormat(buffer);
}
