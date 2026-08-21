/**
 * The media part of the external backend's HTTP adapter: media records and categories.
 * Mixed into the adapter with a spread; why the half is split off and why its name is
 * shared with the Postgres implementation — `TStorageMediaMethods` in
 * `types/adapters.d.ts`.
 *
 * The endpoints' contract mirrors the local `/api/bricks/media/**`:
 * see docs/external-backend-contract.md.
 */
import type { IBackendHttpClient } from './httpClient';
import {
    isConflictError,
    isNotFoundError,
    isUnknownMediaCategoryError,
    normalizeRow,
    normalizeRows,
    unwrapItemsList,
} from './httpAdapterHelpers';
import { BricksUnknownMediaCategoryError } from '../utils/storageErrors';
import type {
    ICreateMediaPayload,
    ICreateMediaCategoryPayload,
    TDeleteMediaCategoryResult,
    TStorageMediaMethods,
    TUpdateMediaPayload,
} from '../../types/adapters';
import type { IMediaCategory, IMediaItem } from '../../../common/types/media';

/**
 * Creates the media part of the HTTP adapter.
 *
 * @param client - The external backend's HTTP client.
 * @returns The media methods of the storage contract.
 */
export function createHttpMediaMethods(client: IBackendHttpClient): TStorageMediaMethods {
    /**
     * The external backend's media list — the shared primitive of the list+find
     * lookups.
     */
    async function fetchMediaList(): Promise<IMediaItem[]> {
        const raw = await client.request('GET', 'media');

        return normalizeRows<IMediaItem>(unwrapItemsList(raw, 'GET media'), 'GET media');
    }

    /**
     * The external backend's category list — the shared primitive of the listing and
     * of resolving a conflict on creation.
     */
    async function fetchMediaCategoryList(): Promise<IMediaCategory[]> {
        const raw = await client.request('GET', 'media/categories');

        return normalizeRows<IMediaCategory>(
            unwrapItemsList(raw, 'GET media/categories'),
            'GET media/categories'
        );
    }

    return {
        /**
         * Every media record (`GET {base}/media`): a flat array or an `{ items }`
         * envelope (the local endpoint's format).
         */
        async listMedia(): Promise<IMediaItem[]> {
            return fetchMediaList();
        },

        /**
         * A media record by id — a list+find (the delete orchestration). A known O(N)
         * limitation over large media libraries; a point-lookup endpoint is a
         * follow-up of the contract.
         */
        async getMedia(id: number): Promise<IMediaItem | null> {
            const items = await fetchMediaList();

            return items.find((item) => item.id === id) ?? null;
        },

        /**
         * A media record by URL — a list+find. Two callers: deduplication of the
         * import from the bucket, and the media proxy, which resolves every canvas
         * snapshot image through it — so over a large library this walks the whole
         * list on a hot path.
         */
        async getMediaByUrl(url: string): Promise<IMediaItem | null> {
            const items = await fetchMediaList();

            return items.find((item) => item.url === url) ?? null;
        },

        /**
         * Registers media metadata (`POST {base}/media` — a server-to-server-only
         * endpoint of the contract, no binary is passed).
         * Idempotency by `url` is the external server's duty; a 409 from the backend
         * is additionally resolved by reading again by url (an import race/a retry),
         * as in the Postgres adapter.
         */
        async createMedia(payload: ICreateMediaPayload): Promise<IMediaItem> {
            try {
                const raw = await client.request('POST', 'media', payload);

                return normalizeRow<IMediaItem>(raw, 'POST media');
            } catch (error: unknown) {
                if (payload.category && isUnknownMediaCategoryError(error)) {
                    throw new BricksUnknownMediaCategoryError(payload.category, error);
                }

                if (!isConflictError(error)) {
                    throw error;
                }

                const existing = await fetchMediaList().then(
                    (items) => items.find((item) => item.url === payload.url) ?? null
                );

                if (!existing) {
                    throw error;
                }

                return existing;
            }
        },

        /**
         * Updates media metadata (`PATCH {base}/media/:id`); a 404 → null.
         */
        async updateMedia(id: number, payload: TUpdateMediaPayload): Promise<IMediaItem | null> {
            try {
                const raw = await client.request('PATCH', `media/${id}`, payload);

                return normalizeRow<IMediaItem>(raw, `PATCH media ${id}`);
            } catch (error: unknown) {
                if (isNotFoundError(error)) {
                    return null;
                }

                if (payload.category && isUnknownMediaCategoryError(error)) {
                    throw new BricksUnknownMediaCategoryError(payload.category, error);
                }

                throw error;
            }
        },

        /**
         * Deletes a media record (`DELETE {base}/media/:id`); a 404 → false.
         * The file-first order of the file's deletion is provided by the local handler
         * (mediaOrchestration.deleteMediaWithFile) — the external one only gets the
         * deletion of the metadata.
         */
        async deleteMedia(id: number): Promise<boolean> {
            try {
                await client.request('DELETE', `media/${id}`);

                return true;
            } catch (error: unknown) {
                if (isNotFoundError(error)) {
                    return false;
                }

                throw error;
            }
        },

        /**
         * The media library's categories (`GET {base}/media/categories`): a flat array
         * or an `{ items }` envelope — the same parsing as the media list's.
         *
         * A failure is not substituted by a system set: a gallery with no categories
         * looks like a working one, and "the categories are not saved" would read as a
         * UI defect rather than as an unimplemented endpoint of the contract.
         */
        async listMediaCategories(): Promise<IMediaCategory[]> {
            return fetchMediaCategoryList();
        },

        /**
         * Creates a category (`POST {base}/media/categories`). Idempotency by `slug`
         * is the external server's duty (as it is for createMedia); a 409 is resolved
         * by reading the list again.
         */
        async createMediaCategory(payload: ICreateMediaCategoryPayload): Promise<IMediaCategory> {
            try {
                const raw = await client.request('POST', 'media/categories', payload);

                return normalizeRow<IMediaCategory>(raw, 'POST media/categories');
            } catch (error: unknown) {
                if (!isConflictError(error)) {
                    throw error;
                }

                const existing = await fetchMediaCategoryList().then(
                    (items) => items.find((item) => item.slug === payload.slug) ?? null
                );

                if (!existing) {
                    throw error;
                }

                return existing;
            }
        },

        /**
         * Deletes a category, clearing it off the files
         * (`DELETE {base}/media/categories/:slug`); a 404 → null.
         *
         * The atomicity of both halves is the external server's duty: the local side
         * cannot wrap somebody else's two writes into a transaction, and splitting the
         * operation into two HTTP calls would mean a window in which the category has
         * already been cleared off the files while the category itself remains.
         */
        async deleteMediaCategory(slug: string): Promise<TDeleteMediaCategoryResult> {
            try {
                const raw = await client.request(
                    'DELETE',
                    `media/categories/${encodeURIComponent(slug)}`
                );
                const response = normalizeRow<{ clearedCount?: unknown }>(
                    raw,
                    `DELETE media/categories ${slug}`
                );
                const clearedCount = Number(response.clearedCount);

                return {
                    clearedCount: Number.isFinite(clearedCount) ? clearedCount : 0,
                };
            } catch (error: unknown) {
                if (isNotFoundError(error)) {
                    return null;
                }

                throw error;
            }
        },
    };
}
