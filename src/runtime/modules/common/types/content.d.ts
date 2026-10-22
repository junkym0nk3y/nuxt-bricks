/**
 * Contract types of the content — the data schema shared by the editor, the renderer
 * and the properties panel.
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
 * An item of the image gallery for the image-gallery editor.
 */
export interface IGalleryItem {
    id: string;
    url: string;
    title?: string;
    caption?: string;
    alt?: string;
    /** Tags of the item (optional, enabled through fields.tags in the brick) */
    tags?: string[];
    /** Optional inline svg (for the image-gallery editor) */
    svgContent?: string;
    /** MIME type of the media (to tell a video from an image) */
    mimeType?: string;
}
