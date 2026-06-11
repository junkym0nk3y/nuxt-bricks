/**
 * Layout-specific shared types
 */

export interface IInlineContentSegment {
    id: string;
    kind: 'text' | 'image' | 'svg' | 'line-break';
    text?: string;
    url?: string;
    alt?: string;
    svgContent?: string;
    color?: string;
    width?: string | number;
    height?: string | number;
}

/**
 * Элемент галереи изображений для image-gallery редактора.
 */
export interface IGalleryItem {
    id: string;
    url: string;
    title?: string;
    caption?: string;
    alt?: string;
    /** Теги элемента (опционально, включается через fields.tags в story) */
    tags?: string[];
    /** Опциональный inline svg (для редактора image-gallery). */
    svgContent?: string;
    /** MIME-тип медиа (для определения видео/изображения). */
    mimeType?: string;
}
