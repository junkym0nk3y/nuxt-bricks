/**
 * Media gallery types
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

export interface IMediaUploadResponse {
    success: boolean;
    url: string;
    error?: string;
    filename: string;
    size: number;
    key: string;
    item?: IMediaItem;
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

export interface IMediaGalleryProps {
    visible: boolean;
    context?: TMediaGalleryContext;
}

export interface IMediaGalleryEmits {
    close: [];
    select: [item: IMediaItem];
    error: [message: string];
}

export type TFormData = import('h3').MultiPartData[] | undefined;

export interface TMediaOptimization {
    maxWidth: number;
    quality: number;
}

export interface TResolvedMediaConfig {
    maxUploadSizeBytes: number;
    maxUploadSizeMb: number;
    maxVideoUploadSizeBytes: number;
    maxVideoUploadSizeMb: number;
    optimization: TMediaOptimization;
}

export interface IValidatedVideo {
    buffer: Buffer;
    mimeType: string;
    targetExtension: string;
}

export interface IValidatedImage {
    optimizedBuffer: Buffer;
    mimeType: string;
    targetExtension: string;
    isSvg: boolean;
}

export interface IBuildUploadedItemParams {
    file: import('h3').MultiPartData;
    key: string;
    url: string;
    optimizedBuffer: Buffer;
    mimeType: string;
    isSvg: boolean;
    uniqueFilename: string;
    formData: TFormData;
    defaultCategory: string;
}
