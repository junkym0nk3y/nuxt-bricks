/**
 * The types of the paired "storage file + database record" operations
 * (`server/utils/mediaOrchestration.ts`).
 */
import type { IPublishAdapter, IStorageAdapter, IUploadedFile } from './adapters';
import type { IUploadMediaVariant, TMediaVariant } from './media';

/**
 * The dependencies of the media orchestration: narrow Pick contracts instead of
 * whole adapters — the logic is unit-tested without a real Postgres or S3.
 */
export interface IMediaOrchestrationDeps {
    storage: Pick<IStorageAdapter, 'getMedia' | 'createMedia' | 'deleteMedia'>;
    publish: Pick<IPublishAdapter, 'buildFileKey' | 'uploadFile' | 'deleteFile' | 'isOwnedUrl'>;
}

/**
 * The parameters for uploading the files of one media item: the full file plus
 * its downscaled variants.
 */
export interface IUploadMediaFilesParams {
    /** The buffer ready to be uploaded (after optimization/validation). */
    buffer: Buffer;
    mimeType: string;
    /**
     * The server-generated object name (`uuid.ext`) — client names never make it into
     * the key.
     */
    storedFilename: string;
    /**
     * The downscaled variants of progressive loading; an empty object — no variants.
     */
    variants?: Partial<Record<TMediaVariant, IUploadMediaVariant>>;
}

/**
 * What the storage ended up holding: the full file plus the variants that made it
 * (a variant is best-effort, so its URL may be missing).
 */
export interface IUploadedMediaFiles {
    uploaded: IUploadedFile;
    previewUrl: string | null;
    mockUrl: string | null;
}

/**
 * The parameters for registering files ALREADY lying in storage.
 *
 * The upload and the registration are split because the file gets into the bucket
 * two different ways: a picture is optimized in memory first, a video travels
 * there as a stream while the request is still being read. The rule about the
 * files' fate when the record fails is one, so it lives in one place.
 */
export interface IRegisterUploadedMediaParams {
    /** The full file in storage: its URL is the record's identity, its size is the record's. */
    uploaded: IUploadedFile;
    mimeType: string;
    /** The file's display name for the media library. */
    displayFilename: string;
    /** null — an upload with no category chosen. */
    category: string | null;
    /** Already sanitized SVG markup (the write policy is the handler's). */
    svgContent?: string | null;
    /** The full file's pixel dimensions; null for an SVG and a video. */
    width?: number | null;
    height?: number | null;
    /** The URLs of the uploaded variants; null — the variant is absent. */
    previewUrl?: string | null;
    mockUrl?: string | null;
}
