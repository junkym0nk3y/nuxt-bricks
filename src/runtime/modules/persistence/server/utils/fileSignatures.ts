/**
 * Сниффинг формата файла по magic bytes: MIME и расширению из multipart
 * не доверяем — класс содержимого (растровое изображение / SVG / видео)
 * подтверждается сигнатурой до передачи в sharp/хранилище.
 */

/** Растровые и векторные форматы, узнаваемые по содержимому. */
export type TSniffedImageFormat = 'jpeg' | 'png' | 'gif' | 'webp' | 'tiff' | 'bmp' | 'heif' | 'svg';

/** Видео-контейнеры, узнаваемые по содержимому. */
export type TSniffedVideoFormat = 'mp4' | 'webm' | 'ogg' | 'avi';

/** Сколько байт головы файла декодировать для текстовой SVG-эвристики. */
const SVG_SNIFF_BYTES = 4096;

/**
 * XML-пролог/комментарии/DOCTYPE перед корневым `<svg` (допустим BOM и пробелы).
 */
const SVG_LEAD_PATTERN =
    /^\uFEFF?\s*(?:(?:<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)\s*)*<svg[\s>/]/i;

/** Бренды ISO-BMFF (`ftyp`), означающие изображение (HEIC/HEIF/AVIF), а не видео. */
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
    'avif',
    'avis',
]);

/**
 * Сверяет байты буфера с ожидаемой сигнатурой по смещению.
 *
 * @param buffer - Проверяемый буфер.
 * @param offset - Смещение начала сигнатуры.
 * @param bytes - Ожидаемые байты.
 */
function hasBytes(buffer: Buffer, offset: number, bytes: number[]): boolean {
    if (buffer.length < offset + bytes.length) {
        return false;
    }

    return bytes.every((byte, index) => buffer[offset + index] === byte);
}

/**
 * Сверяет байты буфера с ASCII-строкой по смещению.
 *
 * @param buffer - Проверяемый буфер.
 * @param offset - Смещение начала строки.
 * @param text - Ожидаемая ASCII-строка.
 */
function hasAscii(buffer: Buffer, offset: number, text: string): boolean {
    if (buffer.length < offset + text.length) {
        return false;
    }

    return buffer.toString('latin1', offset, offset + text.length) === text;
}

/**
 * Возвращает major brand контейнера ISO-BMFF (MP4/MOV/HEIF) или null,
 * если буфер не начинается с box `ftyp`.
 *
 * @param buffer - Проверяемый буфер.
 */
function readFtypBrand(buffer: Buffer): string | null {
    if (buffer.length < 12 || !hasAscii(buffer, 4, 'ftyp')) {
        return null;
    }

    return buffer.toString('latin1', 8, 12).trim().toLowerCase();
}

/**
 * Текстовая эвристика SVG: после BOM/пролога/комментариев/DOCTYPE содержимое
 * начинается с корневого тега `<svg`.
 *
 * @param content - Голова файла как текст.
 */
export function looksLikeSvgMarkup(content: string): boolean {
    return SVG_LEAD_PATTERN.test(content);
}

/**
 * Определяет формат изображения по сигнатуре содержимого.
 *
 * @param buffer - Байты файла.
 * @returns Формат или null, если содержимое — не поддерживаемое изображение.
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

    if (brand && HEIF_IMAGE_BRANDS.has(brand)) {
        return 'heif';
    }

    if (looksLikeSvgMarkup(buffer.toString('utf8', 0, Math.min(buffer.length, SVG_SNIFF_BYTES)))) {
        return 'svg';
    }

    return null;
}

/**
 * Определяет видео-контейнер по сигнатуре содержимого. Контейнеры ISO-BMFF
 * с image-брендом (HEIC/AVIF) видео не считаются.
 *
 * @param buffer - Байты файла.
 * @returns Формат или null, если содержимое — не поддерживаемое видео.
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
