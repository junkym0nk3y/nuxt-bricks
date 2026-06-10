// #region Imports
// Types
import type { ILandingInlineContentSegment } from '../types/layouts';
import type { IMediaItem } from '../../media/types/media';
// #endregion

// #region Constants
const INLINE_SEGMENT_ID_PREFIX = 'inline-segment';
// #endregion

// #region Helpers
function generateInlineSegmentId(): string {
    return `${INLINE_SEGMENT_ID_PREFIX}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Создаёт текстовый сегмент по умолчанию.
 *
 * @param text - Текстовое содержимое сегмента.
 * @returns Новый текстовый сегмент.
 */
export function createInlineTextSegment(text = ''): ILandingInlineContentSegment {
    return {
        id: generateInlineSegmentId(),
        kind: 'text',
        text,
    };
}

/**
 * Создаёт сегмент переноса строки.
 *
 * @returns Новый сегмент переноса строки.
 */
export function createInlineLineBreakSegment(): ILandingInlineContentSegment {
    return {
        id: generateInlineSegmentId(),
        kind: 'line-break',
    };
}

/**
 * Подготавливает SVG содержимое для inline-вставки.
 *
 * @param svgContent - Содержимое SVG файла.
 * @returns Очищенный SVG с обрезанными пробелами.
 */
function normalizeSvgContent(svgContent: string): string {
    return svgContent.trim();
}

/**
 * Возвращает сегмент медиа на основе выбранного элемента галереи.
 *
 * @param item - Элемент медиа-галереи.
 * @returns Сгенерированный сегмент (svg или изображение).
 */
export function createInlineMediaSegmentFromItem(item: IMediaItem): ILandingInlineContentSegment {
    if (item.mimeType === 'image/svg+xml' && item.svgContent) {
        return {
            id: generateInlineSegmentId(),
            kind: 'svg',
            svgContent: normalizeSvgContent(item.svgContent),
            url: item.url,
            alt: item.filename,
            color: '',
            width: '2.4rem',
            height: '2.4rem',
        };
    }

    return {
        id: generateInlineSegmentId(),
        kind: 'image',
        url: item.url,
        alt: item.filename,
        width: '2.4rem',
        height: '2.4rem',
    };
}

/**
 * Применяет цвет к SVG контенту, заменяя fill/stroke на currentColor.
 *
 * @param svgContent - Исходное содержимое SVG.
 * @param color - Цвет текста, который нужно применить.
 * @returns SVG содержимое с подстановкой currentColor.
 */
export function applyColorToSvgContent(svgContent: string, color?: string): string {
    if (!svgContent) {
        return svgContent;
    }

    let normalized = normalizeSvgContent(svgContent);

    if (color) {
        const fillRegex = /fill="(?!none)[^"]*"/gi;
        const strokeRegex = /stroke="(?!none)[^"]*"/gi;

        normalized = normalized.replace(fillRegex, 'fill="currentColor"');
        normalized = normalized.replace(strokeRegex, 'stroke="currentColor"');

        if (!/fill="/i.test(normalized)) {
            normalized = normalized.replace('<svg', '<svg fill="currentColor"');
        }
    }

    return normalized;
}

/**
 * Клонирует массив сегментов для безопасного редактирования.
 *
 * @param segments - Исходные сегменты.
 * @returns Глубокая копия массива сегментов.
 */
export function cloneInlineSegments(
    segments: ILandingInlineContentSegment[]
): ILandingInlineContentSegment[] {
    return segments.map((segment) => ({ ...segment }));
}
// #endregion
