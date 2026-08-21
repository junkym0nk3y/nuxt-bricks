/**
 * The server-side types of media processing (upload, optimization, validation).
 * The contract data types (IMediaItem, the API responses) live in
 * common/types/media.d.ts, and so does the shape of the optimization parameters: it is
 * shared between the client and the server.
 */
import type { IBricksMediaOptimization } from '../../common/types/media';

/**
 * A part of a multipart form read with a limit (structurally compatible with h3's
 * MultiPartData).
 */
export interface IUploadedFilePart {
    name?: string;
    filename?: string;
    type?: string;
    data: Buffer;
}

/**
 * The downscaled raster variants for progressive loading.
 *
 * Lives here rather than next to the naming policy in
 * `server/utils/mediaVariants.ts`: this file describes the data's shape, and importing
 * a type FROM the server runtime would invert the dependency — the declarations would
 * start depending on the implementation, and moving the utility would break the
 * declarations themselves.
 */
export type TMediaVariant = 'preview' | 'mock';

/**
 * The raw optimization fields from the multipart form: overrides for one upload.
 *
 * Strings specifically rather than numbers: telling "the field did not arrive" from
 * "an unusable one arrived" is the request's parsing job, not the caller's. While the
 * handler did it, the value it had parsed was already indistinguishable from the
 * config's default, and the input field's bounds covered the config along with the
 * request.
 */
export interface IMediaOptimizationRequestFields {
    format?: string;
    quality?: string;
    maxWidth?: string;
}

export interface IResolvedMediaConfig {
    maxUploadSizeBytes: number;
    maxUploadSizeMb: number;
    maxVideoUploadSizeBytes: number;
    maxVideoUploadSizeMb: number;
    optimization: IBricksMediaOptimization;
}

/**
 * A file prepared for upload: the result of validating and processing one multipart
 * file, which the upload handler passes to the orchestration.
 */
export interface IPreparedUpload {
    buffer: Buffer;
    mimeType: string;
    targetExtension: string;
    svgContent: string | null;
    /** The full file's pixel dimensions; null for an SVG and a video. */
    width: number | null;
    height: number | null;
    /** The downscaled variants of progressive loading (with no object names). */
    variants: Partial<Record<TMediaVariant, IOptimizedImage>>;
}

export interface IValidatedVideo {
    buffer: Buffer;
    mimeType: string;
    targetExtension: string;
}

/** A downscaled raster variant ready for upload. */
export interface IUploadMediaVariant {
    buffer: Buffer;
    mimeType: string;
    /** The server-generated object name of the variant (`uuid-preview.webp`). */
    storedFilename: string;
}

/**
 * The square cropping frame in the input image's pixels — with the EXIF orientation
 * already applied, that is, in the same coordinates the browser sees the photo in (it
 * applies the orientation itself).
 */
export interface IImageCropFrame {
    left: number;
    top: number;
    /** The square's side: an avatar is square, and a second side would be a copy. */
    side: number;
}

/**
 * An image's pixel dimensions, both known. The readers return `… | null` and use the
 * `null` for "sharp could not determine them" — the shape itself carries no absence.
 */
export interface IImageDimensions {
    width: number;
    height: number;
}

/**
 * The result of processing a raster: the finished bytes and what it turned out to be.
 */
export interface IOptimizedImage {
    buffer: Buffer;
    mimeType: string;
    extension: string;
    /** The result's pixel dimensions; null — sharp could not determine them. */
    width: number | null;
    height: number | null;
}

export interface IValidatedImage {
    optimizedBuffer: Buffer;
    mimeType: string;
    targetExtension: string;
    isSvg: boolean;
    /**
     * The full file's dimensions; null for an SVG (vector dimensions do not reduce to
     * pixels).
     */
    width: number | null;
    height: number | null;
    /**
     * The downscaled variants of progressive loading. An empty object — there are no
     * variants (an SVG, or sharp did not manage this input): the consumer must then
     * show the full file right away.
     */
    variants: Partial<Record<TMediaVariant, IOptimizedImage>>;
}
