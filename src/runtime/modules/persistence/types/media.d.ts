/**
 * Серверные типы обработки медиа (upload, оптимизация, валидация).
 * Контрактные data-типы (IMediaItem, ответы API) живут в common/types/media.d.ts.
 */

/** Часть multipart-формы, прочитанной с лимитом (структурно совместима с h3 MultiPartData). */
export interface IUploadedFilePart {
    name?: string;
    filename?: string;
    type?: string;
    data: Buffer;
}

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
