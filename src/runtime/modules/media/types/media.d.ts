/**
 * Media gallery types (UI и серверная обработка).
 * Контрактные data-типы (IMediaItem, ответы API, TMediaGalleryContext)
 * живут в common/types/media.d.ts.
 */

import type { IMediaItem, TMediaGalleryContext } from '../../common/types/media';

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
