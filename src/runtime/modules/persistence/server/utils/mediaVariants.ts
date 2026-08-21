/**
 * The naming policy of the downscaled raster variants (progressive loading).
 *
 * The variants live next to the full file under the same uuid and differ by a suffix:
 * `<uuid>.<ext>` / `<uuid>-preview.<ext>` / `<uuid>-mock.<ext>`. The names are kept in
 * one place because three independent consumers read them: the generation at upload
 * time, the file's deletion (the variants have to be wiped along with the full one) and
 * the import from the bucket (the variants must not become separate records of the
 * media library).
 */

// Types
import type { TMediaVariant } from '../../types/media';

/** The file name suffix for each variant. */
const MEDIA_VARIANT_SUFFIXES: Record<TMediaVariant, string> = {
    preview: '-preview',
    mock: '-mock',
};

/**
 * The parameters for generating the variants.
 *
 * `preview` is what the user sees in place of the full file almost right away: 480px is
 * enough for the frame to read in any block of the page. `mock` is a blurred stand-in
 * for the first frame, its only job being that the space is not empty, hence 32px and
 * the lowest possible quality (a few kilobytes).
 */
export const MEDIA_VARIANT_PRESETS: Record<TMediaVariant, { maxWidth: number; quality: number }> = {
    preview: { maxWidth: 480, quality: 40 },
    mock: { maxWidth: 32, quality: 20 },
};

/**
 * Builds a variant's file name out of the full file's name.
 *
 * @param storedFilename - The full file's name (`<uuid>.<ext>`).
 * @param variant - The variant required.
 * @param extension - The variant's extension (the variants are kept in a web-safe
 *   format regardless of the full file's format).
 * @returns The variant's file name.
 */
export function buildMediaVariantFilename(
    storedFilename: string,
    variant: TMediaVariant,
    extension: string
): string {
    const lastDotIndex = storedFilename.lastIndexOf('.');
    const baseName = lastDotIndex > 0 ? storedFilename.slice(0, lastDotIndex) : storedFilename;

    return `${baseName}${MEDIA_VARIANT_SUFFIXES[variant]}.${extension}`;
}

/**
 * Whether a file name (or an S3 key) is a downscaled variant.
 *
 * The name without its extension is matched: the suffix stands before the dot, and a
 * substring check would give a false positive over an honest name like
 * `hero-preview-final.webp` uploaded by a user.
 *
 * @param filenameOrKey - The file's name, or the full S3 key.
 * @returns true — the file is a variant.
 */
export function isMediaVariantFilename(filenameOrKey: string): boolean {
    const filename = filenameOrKey.split('/').pop() ?? filenameOrKey;
    const lastDotIndex = filename.lastIndexOf('.');
    const baseName = lastDotIndex > 0 ? filename.slice(0, lastDotIndex) : filename;

    return Object.values(MEDIA_VARIANT_SUFFIXES).some((suffix) => baseName.endsWith(suffix));
}
