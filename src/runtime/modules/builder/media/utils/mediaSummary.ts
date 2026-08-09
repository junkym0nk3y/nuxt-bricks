/**
 * Технические сводки файла для второго ряда мета-панели.
 *
 * Строка собирается здесь, а не в шаблоне, потому что состав её частей зависит
 * от типа файла: у видео нет вариантов, у вектора нет ни габаритов, ни
 * вариантов, у растра, загруженного до появления вариантов, они тоже пустые.
 * В шаблоне это было бы гнездо `v-if`.
 */

// Types
import type { IMediaItem } from '../../../common/types/media';
import type { TTranslateFn } from '../../../common/utils/i18nLabels';

// Utils
import { formatFileSize } from './formatFileSize';

/** Разделитель частей технической строки. */
const SUMMARY_SEPARATOR = ' · ';

/**
 * Является ли файл видео.
 *
 * @param item - Медиа-элемент.
 */
export function isVideoMedia(item: IMediaItem): boolean {
    return item.mimeType.startsWith('video/');
}

/**
 * Является ли файл вектором (SVG).
 *
 * @param item - Медиа-элемент.
 */
function isVectorMedia(item: IMediaItem): boolean {
    return item.mimeType === 'image/svg+xml';
}

/**
 * Короткое имя формата из MIME (`image/webp` → `WebP`, `video/mp4` → `MP4`).
 *
 * @param mimeType - MIME файла.
 * @returns Имя формата в привычном написании.
 */
function formatMediaFormatName(mimeType: string): string {
    const subtype = mimeType.split('/')[1] ?? mimeType;
    const normalized = subtype.replace('svg+xml', 'svg').replace('quicktime', 'mov');

    return normalized === 'webp' ? 'WebP' : normalized.toUpperCase();
}

/**
 * Габариты растра для подписи плитки и мета-панели: «1600×900», либо подпись
 * типа для файлов без пиксельных размеров.
 *
 * @param item - Медиа-элемент.
 * @param translate - Функция перевода вызывающего.
 * @returns Габариты или подпись типа.
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
 * Техническая строка второго ряда мета-панели: габариты, вес, формат.
 *
 * Про варианты постепенной загрузки строка молчит. Пользователю они ничего не
 * решают: режим загрузки выбирается у блока Media, а не у файла, генерируются
 * варианты сами и всегда, — то есть «варианты: full · preview · mock» было
 * сообщением о внутренней механике, а «вариантов нет» у svg и видео читалось
 * как поломка, хотя это норма.
 *
 * @param item - Медиа-элемент.
 * @param translate - Функция перевода вызывающего.
 * @returns Готовая строка.
 */
export function formatMediaTechnicalSummary(item: IMediaItem, translate: TTranslateFn): string {
    return [
        formatMediaDimensions(item, translate),
        formatFileSize(item.size),
        formatMediaFormatName(item.mimeType),
    ].join(SUMMARY_SEPARATOR);
}
