/**
 * Orchestration of the paired "storage file + database record" operations for
 * media.
 *
 * The server owns both halves of the operation in full (the client makes one
 * request) — the former two-step client flow (the s3 handlers + /api/bricks/media)
 * left orphans behind when the second step failed and reported success on an error.
 *
 * The dependencies are passed as a parameter (narrow Pick contracts) — the logic is
 * unit-tested without a real Postgres or S3.
 */
import { createError } from 'h3';
import type { IMediaItem } from '../../../common/types/media';
import type { ICreateMediaPayload, IPublishAdapter, IStorageAdapter } from '../../types/adapters';
import type { IUploadMediaVariant, TMediaVariant } from '../../types/media';
import { BricksStorageWriteRejectedError } from './storageErrors';

/**
 * The dependencies of the media orchestration.
 */
export interface IMediaOrchestrationDeps {
    storage: Pick<IStorageAdapter, 'getMedia' | 'createMedia' | 'deleteMedia'>;
    publish: Pick<IPublishAdapter, 'buildFileKey' | 'uploadFile' | 'deleteFile' | 'isOwnedUrl'>;
}

/**
 * The parameters for registering an uploaded media file.
 */
export interface IUploadMediaParams {
    /** The buffer ready to be uploaded (after optimization/validation). */
    buffer: Buffer;
    mimeType: string;
    /**
     * The server-generated object name (`uuid.ext`) — client names never make it into
     * the key.
     */
    storedFilename: string;
    /** The file's display name for the media library. */
    displayFilename: string;
    /** null — an upload with no category chosen. */
    category: string | null;
    /** Already sanitized SVG markup (the write policy is the handler's). */
    svgContent?: string | null;
    /** The full file's pixel dimensions; null for an SVG and a video. */
    width?: number | null;
    height?: number | null;
    /**
     * The downscaled variants of progressive loading; an empty object — no variants.
     */
    variants?: Partial<Record<TMediaVariant, IUploadMediaVariant>>;
}

/**
 * Uploads a variant into the publication storage best-effort.
 *
 * A variant failing does not bring the upload down: with no variant the consumer
 * plainly shows the full file right away, whereas failing the file's own upload
 * because of it would mean losing the user's work for the sake of a secondary
 * artifact.
 *
 * @param deps - The persistence adapters.
 * @param variant - The finished variant.
 * @returns The uploaded variant's URL, or null on a failure.
 */
async function uploadVariantFile(
    deps: IMediaOrchestrationDeps,
    variant: IUploadMediaVariant
): Promise<string | null> {
    try {
        const uploaded = await deps.publish.uploadFile({
            buffer: variant.buffer,
            mimeType: variant.mimeType,
            key: deps.publish.buildFileKey('media', variant.storedFilename),
        });

        return uploaded.url;
    } catch (error: unknown) {
        console.warn('[Media Orchestration] Failed to upload media variant:', error);

        return null;
    }
}

/**
 * Best-effort deletion of the variants' files.
 *
 * In parallel: the deletions are independent, while a sequential pass would pay an
 * extra round trip to storage per variant. Each one's failure is muted by a `catch`
 * of its own, so `Promise.all` here does not cancel the remaining deletions.
 *
 * @param deps - The persistence adapters.
 * @param urls - The variants' URLs (null/undefined are skipped).
 */
async function deleteVariantFiles(
    deps: Pick<IMediaOrchestrationDeps, 'publish'>,
    urls: (string | null | undefined)[]
): Promise<void> {
    const ownedUrls = urls
        .filter((url): url is string => Boolean(url))
        .filter((url) => deps.publish.isOwnedUrl(url));

    await Promise.all(
        ownedUrls.map(async (url) => {
            try {
                await deps.publish.deleteFile(url);
            } catch (error: unknown) {
                console.warn('[Media Orchestration] Failed to delete media variant file:', error);
            }
        })
    );
}

/**
 * Compensation of the uploaded files: the record was not created — neither the full
 * file nor the variants must be left as orphans.
 *
 * Called ONLY under a guarantee that the write was refused: on an unknown outcome
 * the deletion would leave a row in the database pointing at a deleted object.
 *
 * @param deps - The persistence adapters.
 * @param fullUrl - The full file's URL.
 * @param variantUrls - The URLs of the successfully uploaded variants.
 */
async function compensateUploadedFiles(
    deps: IMediaOrchestrationDeps,
    fullUrl: string,
    variantUrls: (string | null)[]
): Promise<void> {
    await deleteVariantFiles(deps, variantUrls);

    try {
        await deps.publish.deleteFile(fullUrl);
    } catch (cleanupError: unknown) {
        console.error(
            '[Media Orchestration] Failed to cleanup uploaded file after DB error:',
            cleanupError
        );
    }
}

/**
 * Uploads the file (and its downscaled variants) into the publication storage and
 * registers the metadata in the database.
 *
 * The files' fate when the write fails is decided by WHAT is known about the
 * write's outcome. Storage guaranteed the refusal
 * (`BricksStorageWriteRejectedError`) — the files are compensated by deletion. The
 * outcome is unknown (a dropped connection, a transport timeout, a 5xx from an
 * external backend) — the former unconditional deletion wiped the files out from
 * under a record the backend had managed to commit, leaving broken tiles in the
 * gallery. That is why ONE retry of the registration happens here: `createMedia` is
 * idempotent by url (a unique index plus rereading the row), so the retry either
 * finds the record already created or creates the missing one. Should it not help
 * either — the files are kept and their addresses go into the log: an invisible
 * object in the bucket costs less than a row pointing at a deleted file forever.
 *
 * The retry's error never reaches the client: it was the FIRST error that made the
 * outcome unknown, and a definite refusal of the retry (the category was deleted just
 * now, for instance) says nothing about the fate of the first attempt — compensating
 * by it is not allowed.
 *
 * @param deps - The persistence adapters.
 * @param params - The upload's data.
 * @returns The created media record.
 */
export async function uploadAndRegisterMedia(
    deps: IMediaOrchestrationDeps,
    params: IUploadMediaParams
): Promise<IMediaItem> {
    const key = deps.publish.buildFileKey('media', params.storedFilename);
    const uploaded = await deps.publish.uploadFile({
        buffer: params.buffer,
        mimeType: params.mimeType,
        key,
    });
    const previewVariant = params.variants?.preview;
    const mockVariant = params.variants?.mock;
    // In parallel: the variants are independent, while a sequential upload added
    // an extra round trip to storage to every upload. A variant's failure is muted
    // by `uploadVariantFile` itself, so there can be no rejection here
    const [previewUrl, mockUrl] = await Promise.all([
        previewVariant ? uploadVariantFile(deps, previewVariant) : null,
        mockVariant ? uploadVariantFile(deps, mockVariant) : null,
    ]);
    const payload: ICreateMediaPayload = {
        url: uploaded.url,
        filename: params.displayFilename,
        size: uploaded.size,
        mimeType: params.mimeType,
        category: params.category,
        svgContent: params.svgContent ?? null,
        width: params.width ?? null,
        height: params.height ?? null,
        previewUrl,
        mockUrl,
    };

    try {
        return await deps.storage.createMedia(payload);
    } catch (error: unknown) {
        if (error instanceof BricksStorageWriteRejectedError) {
            await compensateUploadedFiles(deps, uploaded.url, [previewUrl, mockUrl]);

            throw error;
        }

        try {
            return await deps.storage.createMedia(payload);
        } catch (retryError: unknown) {
            console.error(
                '[Media Orchestration] Media registration outcome is unknown, uploaded files are retained:',
                {
                    urls: [uploaded.url, previewUrl, mockUrl].filter(Boolean),
                    error,
                    retryError,
                }
            );

            throw error;
        }
    }
}

/**
 * Deletes a media item: the storage file first, the database record after
 * (file-first).
 *
 * The order makes the operation recoverable: deleting an S3 object is idempotent,
 * so after a database failure a repeated DELETE carries the operation through. A
 * storage error is a 502, and the record stays (otherwise the file would become an
 * invisible orphan). A URL outside our own storage (an external file) is not managed
 * by the module — only the record is deleted.
 *
 * @param deps - The persistence adapters.
 * @param id - The media record's identifier.
 * @returns false — the record was not found; true — deleted.
 */
export async function deleteMediaWithFile(
    deps: IMediaOrchestrationDeps,
    id: number
): Promise<boolean> {
    const media = await deps.storage.getMedia(id);

    if (!media) {
        return false;
    }

    if (deps.publish.isOwnedUrl(media.url)) {
        // The variants come before the full file and are best-effort: they are
        // secondary, and a stuck variant must not block the deletion of the file
        // itself. After the record is deleted no links to them will remain at all,
        // so the "variants first" order merely narrows the window in which they are
        // already orphaned
        await deleteVariantFiles(deps, [media.previewUrl, media.mockUrl]);

        try {
            await deps.publish.deleteFile(media.url);
        } catch (error: unknown) {
            console.error('[Media Orchestration] Failed to delete media file:', error);
            throw createError({
                statusCode: 502,
                statusMessage: 'Failed to delete media file from storage',
            });
        }
    } else {
        console.warn(
            '[Media Orchestration] Media url is outside of the managed storage, deleting DB record only:',
            media.url
        );
    }

    return deps.storage.deleteMedia(id);
}

/**
 * Best-effort deletion of a deleted page's preview file: a preview is a secondary
 * artifact, and its error must not bring the page's deletion down. The URL is stored
 * with a cache buster (`?v=`) — the query is cut off by the adapter's key policy.
 *
 * @param publish - The publish adapter.
 * @param thumbnailUrl - The page's stored preview URL.
 */
export async function cleanupPageThumbnail(
    publish: Pick<IPublishAdapter, 'deleteFile' | 'isOwnedUrl'>,
    thumbnailUrl: string | null | undefined
): Promise<void> {
    if (!thumbnailUrl || !publish.isOwnedUrl(thumbnailUrl)) {
        return;
    }

    try {
        await publish.deleteFile(thumbnailUrl);
    } catch (error: unknown) {
        console.warn('[Media Orchestration] Failed to cleanup page thumbnail:', error);
    }
}
