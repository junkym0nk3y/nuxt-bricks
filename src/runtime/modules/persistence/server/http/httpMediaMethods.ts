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
    unwrapItemEnvelope,
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
     * The external backend's point lookup of a media record by URL
     * (`GET {base}/media/by-url?url=<encoded>`) — the shared primitive of the media
     * proxy and of resolving a conflict on registration.
     *
     * A query parameter rather than a path segment: a URL is not a segment, and an
     * `encodeURIComponent` of it inside a path leaves a `%2F` per separator — which
     * proxies normalize back into a separator, handing the backend a heap of segments
     * instead of one value.
     *
     * The record answering with a URL other than the one asked for is a format error
     * and not a find: the media proxy reads the answer as the permission to fetch,
     * and a substituted record would turn the anti-SSRF check into a check of
     * somebody else's address.
     *
     * A 404 is deliberately NOT caught here: the absence of a record is what
     * `{ item: null }` says, so a 404 means the mandatory endpoint is missing, and
     * silently passing it off as "no such file" would leave every canvas snapshot
     * image refused with no reason given.
     *
     * @param url - URL of the file.
     * @returns The record, or null when the backend has none.
     */
    async function fetchMediaByUrl(url: string): Promise<IMediaItem | null> {
        const context = 'GET media/by-url';
        const raw = await client.request('GET', `media/by-url?url=${encodeURIComponent(url)}`);
        const rawItem = unwrapItemEnvelope(raw, context);

        if (rawItem === null) {
            return null;
        }

        const item = normalizeRow<IMediaItem>(rawItem, context);

        if (item.url !== url) {
            throw new Error(`[Bricks Backend] ${context}: answered with a record of another url`);
        }

        return item;
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
         * A media record by URL — the contract's point lookup. The media proxy
         * resolves every image of a canvas snapshot through it, so a list+find here
         * used to download the whole media library per picture.
         */
        async getMediaByUrl(url: string): Promise<IMediaItem | null> {
            return fetchMediaByUrl(url);
        },

        /**
         * Registers media metadata (`POST {base}/media` — a server-to-server-only
         * endpoint of the contract, no binary is passed).
         * Idempotency by `url` is the external server's duty; a 409 from the backend
         * is additionally resolved by the point lookup by url (an import race/a
         * retry), as in the Postgres adapter.
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

                const existing = await fetchMediaByUrl(payload.url);

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
