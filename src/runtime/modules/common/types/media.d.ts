/**
 * Контрактные data-типы медиа — часть схемы данных всей системы.
 * UI-типы галереи и серверные типы обработки остаются в media/types/media.d.ts.
 */

export interface IMediaItem {
    id: number;
    url: string;
    filename: string;
    alt: string;
    size: number;
    uploadedAt: string;
    mimeType: string;
    category: string;
    thumbnailUrl?: string;
    svgContent: string | null;
}

export interface IMediaUpdateMetaRequest {
    filename?: string;
    alt?: string;
}

export interface IMediaListResponse {
    success: boolean;
    items: IMediaItem[];
    error?: string;
}

export interface IMediaUpdateCategoryRequest {
    category: string;
}

export type TMediaGalleryContext = 'manager' | 'publish' | 'properties';
