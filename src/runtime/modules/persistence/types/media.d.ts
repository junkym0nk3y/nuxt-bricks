/**
 * Серверные типы обработки медиа (upload, оптимизация, валидация).
 * Контрактные data-типы (IMediaItem, ответы API) живут в common/types/media.d.ts.
 */

export type TFormData = import('h3').MultiPartData[] | undefined;

export interface IMediaOptimization {
    maxWidth: number;
    quality: number;
}

export interface IResolvedMediaConfig {
    maxUploadSizeBytes: number;
    maxUploadSizeMb: number;
    maxVideoUploadSizeBytes: number;
    maxVideoUploadSizeMb: number;
    optimization: IMediaOptimization;
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
