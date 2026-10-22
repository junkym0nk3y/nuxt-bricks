/**
 * The technical summaries of a file, for the second row of the meta panel.
 *
 * The line always holds the same three parts — dimensions, weight, format — and it is
 * assembled here rather than in the template because of the first of them: a video and
 * a vector have no pixel dimensions, nor has a raster uploaded before the dimensions
 * started being stored, so each of those gets a caption of its own instead. In a
 * template that would be a nest of `v-if`.
 */

// Types
import type { IMediaItem } from '../../../common/types/media';
import type { TTranslateFn } from '../../../common/utils/i18nLabels';

// Utils
import { formatFileSize } from './formatFileSize';

/** Separator of the parts of the technical line */
const SUMMARY_SEPARATOR = ' · ';

/**
 * Whether the file is a video.
 *
 * @param item - The media item.
 */
export function isVideoMedia(item: IMediaItem): boolean {
    return item.mimeType.startsWith('video/');
}

/**
 * Whether the file is a vector (SVG).
 *
 * @param item - The media item.
 */
function isVectorMedia(item: IMediaItem): boolean {
    return item.mimeType === 'image/svg+xml';
}

/**
 * The short name of a format out of its MIME type (`image/webp` → `WebP`,
 * `video/mp4` → `MP4`).
 *
 * @param mimeType - MIME type of the file.
 * @returns The name of the format in its usual spelling.
 */
export function formatMediaFormatName(mimeType: string): string {
    const subtype = mimeType.split('/')[1] ?? mimeType;
    const normalized = subtype.replace('svg+xml', 'svg').replace('quicktime', 'mov');

    return normalized === 'webp' ? 'WebP' : normalized.toUpperCase();
}

/**
 * The dimensions of a raster, for the caption of a tile and for the meta panel:
 * "1600×900", or the caption of the type for files with no pixel dimensions.
 *
 * @param item - The media item.
 * @param translate - The translate function of the caller.
 * @returns The dimensions or the caption of the type.
 */
export function formatMediaDimensions(item: IMediaItem, translate: TTranslateFn): string {
    if (isVideoMedia(item)) {
        return translate('bricks.media.summary.video');
    }

    if (isVectorMedia(item)) {
        return translate('bricks.media.summary.vector');
    }

    if (item.width && item.height) {
        return `${item.width}×${item.height}`;
    }

    return translate('bricks.media.summary.dimensionsUnknown');
}

/**
 * The technical line of the second row of the meta panel: dimensions, weight,
 * format.
 *
 * The line says nothing about the progressive-loading variants. They decide nothing
 * for the user: the loading mode is picked on the Media block rather than on a file,
 * and the variants are generated on their own and always — so "variants: full ·
 * preview · mock" was a report about internal machinery, while "no variants" on an
 * svg or a video read as a breakage, though it is the norm.
 *
 * @param item - The media item.
 * @param translate - The translate function of the caller.
 * @returns The finished string.
 */
export function formatMediaTechnicalSummary(item: IMediaItem, translate: TTranslateFn): string {
    return [
        formatMediaDimensions(item, translate),
        formatFileSize(item.size),
        formatMediaFormatName(item.mimeType),
    ].join(SUMMARY_SEPARATOR);
}
