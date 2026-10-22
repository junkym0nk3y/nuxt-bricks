/**
 * The caption of the upload parameters — on a single line.
 *
 * Two places show that line (the tooltip of the upload button and the overlay of
 * the drop target), and which parts it is made of depends on the format: "Original"
 * has neither a quality nor a width, and printing "q70 · up to 1920px" next to it
 * would be a lie.
 */

// Types
import type { IBricksMediaOptimization } from '../../../common/types/media';
import type { TTranslateFn } from '../../../common/utils/i18nLabels';

/**
 * Returns the caption of the current optimization parameters.
 *
 * @param optimization - The upload parameters.
 * @param translate - The translate function of the caller.
 * @returns The finished string.
 */
export function formatOptimizationSummary(
    optimization: IBricksMediaOptimization,
    translate: TTranslateFn
): string {
    const { format, quality, maxWidth } = optimization;

    if (format === 'original') {
        return translate('bricks.media.upload.formatOriginal');
    }

    return translate('bricks.media.upload.paramsSummary', {
        format: 'WebP',
        quality,
        maxWidth,
    });
}
