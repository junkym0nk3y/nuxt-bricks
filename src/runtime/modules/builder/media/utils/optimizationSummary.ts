/**
 * Подпись параметров загрузки — одной строкой.
 *
 * Строку показывают два места (тултип кнопки загрузки и оверлей приёмника), и
 * состав её частей зависит от формата: у «Оригинала» ни качества, ни ширины
 * нет, и печатать рядом с ним «q70 · до 1920px» значило бы врать.
 */

// Types
import type { IBricksMediaOptimization } from '../../../common/types/media';
import type { TTranslateFn } from '../../../common/utils/i18nLabels';

/**
 * Возвращает подпись текущих параметров оптимизации.
 *
 * @param optimization - Параметры загрузки.
 * @param translate - Функция перевода вызывающего.
 * @returns Готовая строка.
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
