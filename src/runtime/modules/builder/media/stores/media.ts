// #region Imports
import { defineStore } from 'pinia';
import type { Composer } from 'vue-i18n';
import { useNuxtApp } from '#imports';
import type {
    IBricksMediaOptimization,
    IMediaItem,
    IMediaUpdateCategoryRequest,
    IMediaUpdateMetaRequest,
} from '../../../common/types/media';
import { useApiClient } from '../../../common/composables/useApiClient';
import { isRequestTimeoutError } from '../../../common/utils/apiRequestPolicy';
import { isMediaListResponse, toMediaRequestError } from '../utils/requestErrors';
import { normalizeMediaItem } from '../utils/normalizeMediaItem';
import { requestMediaStorageImport } from '../utils/storageImport';
import type { IMediaStorageImportResult } from '../types/storageImport';
import { useMediaWriteOrderStore } from './mediaWriteOrder';
import { BRICKS_MEDIA_UPLOAD_TIMEOUT_MS } from '../../../common/constants/apiTimeouts';
import { ALL_MEDIA_CATEGORIES_FILTER } from '../../../common/constants/mediaCategories';
// #endregion

// #region Helpers
/**
 * Translates a key through the global i18n (a store has no setup context).
 * `$i18n` is resolved lazily on every call — safe under any order of the plugins.
 */
function t(key: string): string {
    const i18n = useNuxtApp().$i18n as Composer | undefined;
    return i18n ? i18n.t(key) : key;
}

/**
 * The storage walk in flight — one per instance of the store.
 *
 * Held outside the state: this is a Promise, and the state of a store is serialized. The
 * key is the store itself rather than the module: one shared Promise would mix up the
 * SSR requests of different users, handing one the contents of a library fetched for
 * another.
 */
const pendingStorageImports = new WeakMap<object, Promise<IMediaStorageImportResult>>();
// #endregion

export const useMediaStore = defineStore('bricksMedia', {
    state: () => ({
        items: [] as IMediaItem[],
        // A counter rather than a flag: with two parallel uploads the `finally` of the
        // first would take the indicator down while the second was still running
        uploadingCount: 0,
        // The number of the list request that started last — by it both the answers that
        // arrived out of the order they left in and the answer a local write overtook are
        // cut off (see `loadItems`)
        itemsRequestId: 0,
        // Whether the whole contents of the media library have been seen.
        // `items.length > 0` does not mean that: an uploaded file is put into the list
        // locally, before any GET at all — and the list then holds one familiar name
        // instead of the whole library. Knowing the difference matters where the absence
        // of a URL from the list is read as "the media library holds no such image" (the
        // comparison during a schema import). A refusal does not clear the flag: the last
        // successful answer stays a trustworthy snapshot even if the next request never
        // got through.
        hasLoadedItemsSnapshot: false,
        // Whether pulling the contents of the bucket into the library has been tried
        // already. The import makes sense exactly once per session: it is idempotent, but
        // it walks the whole managed prefix of the storage, and repeating that walk on
        // every opening of an empty gallery is pointless.
        hasAttemptedStorageImport: false,
    }),

    getters: {
        /**
         * Whether at least one file upload is running.
         */
        isUploading: (state): boolean => state.uploadingCount > 0,
    },

    actions: {
        /**
         * Invalidates a list request already in flight: its answer knows nothing of the
         * local write, so it would bring a deleted file back into the gallery, lose one
         * just uploaded and roll an edit of the metadata back.
         */
        invalidatePendingItemsLoad(): void {
            this.itemsRequestId += 1;
        },

        /**
         * Loads the media list out of the backend (S3 + the database).
         *
         * A refusal does not empty the list: a gallery already on screen outlives a
         * transient refusal of a repeated opening, and it is the caller who gets the
         * message. An unrecognized response shape is a refusal too rather than an empty
         * gallery: emptying it silently would look like "there are no files".
         */
        async loadItems(): Promise<void> {
            const { apiFetcher } = useApiClient();
            const requestId = ++this.itemsRequestId;

            try {
                const response = await apiFetcher<unknown>('/api/bricks/media/');

                if (!isMediaListResponse(response)) {
                    throw new Error(t('bricks.media.listResponseInvalid'));
                }

                if (requestId !== this.itemsRequestId) {
                    return;
                }

                const items = response.items.length
                    ? response.items
                    : await this.importFromStorage();

                if (requestId !== this.itemsRequestId) {
                    return;
                }

                this.items = items.map(normalizeMediaItem);
                // Only here: the answer was accepted, so the list equals the contents of
                // the library as of that answer. A displaced request leaves above — its
                // list is out of date, and declaring a snapshot by it is not allowed
                this.hasLoadedItemsSnapshot = true;
            } catch (error: unknown) {
                // The refusal of a displaced request is not reported to the caller: a
                // toast about a stale attempt would cover the result of a fresher one that
                // has already shown the list
                if (requestId !== this.itemsRequestId) {
                    return;
                }

                console.error('[Media Store] Failed to load items from backend:', error);

                throw toMediaRequestError(error, 'GET', t, t('bricks.media.loadFailed'));
            }
        },

        /**
         * Pulls into the media library the files that already lie in the publish
         * storage. Called when the list arrived empty.
         *
         * The walk over the storage happens no more than once per session — but only if
         * the attempt did take place. A temporary refusal (a broken connection, a 5xx)
         * does not raise the flag: otherwise a single failure would leave an
         * administrator with an empty gallery until the page was reloaded. A refusal by
         * rights is final.
         *
         * @returns The contents of the library after the import; empty — there was
         * nothing to import, or the attempt failed.
         */
        async importFromStorage(): Promise<IMediaItem[]> {
            // A second call made while the first is still in flight waits on that same
            // answer instead of getting an empty list: otherwise it would declare itself
            // the last request, show an empty gallery — and the result of an import that
            // had already succeeded would be thrown away as stale
            const pending = pendingStorageImports.get(this);

            if (pending) {
                return (await pending).items;
            }

            if (this.hasAttemptedStorageImport) {
                return [];
            }

            this.hasAttemptedStorageImport = true;

            const request = requestMediaStorageImport(useApiClient().apiFetcher);
            pendingStorageImports.set(this, request);

            try {
                const result = await request;

                if (result.isRetryable) {
                    this.hasAttemptedStorageImport = false;
                }

                return result.items;
            } finally {
                pendingStorageImports.delete(this);
            }
        },

        /**
         * Starts a reread of the list and forgets it: what the caller needs is the fact
         * that it started, and the result guarantees nothing here — the request is able to
         * overtake a server write still under way. A refusal is swallowed right here,
         * otherwise the rejection would go into a promise nobody handles.
         */
        reloadItemsDetached(): void {
            // No `void` in front of it — oxlint's `no-void` rule
            this.loadItems().catch((error: unknown) => {
                console.warn('[Media Store] Items reload after write timeout failed:', error);
            });
        },

        /**
         * Closes an operation over an item and rereads the list when a check against the
         * server has come due: the item has seen a refusal and no other write over it is
         * still in flight.
         *
         * That check is not there "just in case": a refusal of a fresher write leaves the
         * success of an earlier one unapplied, because it counts as stale by the order of
         * the starts while who won on the server is unknown. Waiting for silence is a
         * must: a GET fired straight out of the `catch` would overtake a PATCH still
         * under way and read the state from before it.
         *
         * @param id - Id of the media item.
         * @param failed - The operation ended in a refusal.
         */
        finishItemOperation(id: number, failed: boolean): void {
            if (useMediaWriteOrderStore().endItemOperation(id, failed)) {
                this.reloadItemsDetached();
            }
        },

        /**
         * Coerces a refusal of a write into what is shown to the user. Rereading the
         * list was taken out of here: for the operations over an item it is
         * `finishItemOperation` that lets it go. An upload stays the exception and checks
         * itself: its id is unknown until the answer, so there is not even an item yet to
         * wait for silence over.
         *
         * @param error - The original error of the request.
         * @param method - HTTP method of the request.
         * @param fallbackMessage - Localized message for an error that says nothing.
         * @returns The error to show to the user.
         */
        toWriteError(error: unknown, method: string, fallbackMessage: string): Error {
            return toMediaRequestError(error, method, t, fallbackMessage);
        },

        /**
         * Applies to a list item the fields the finished operation owns. The item is
         * looked up by `id` anew: an index taken before the request could have shifted (a
         * neighbor was deleted, the list was reloaded), and a splice by it would replace
         * somebody else's item. Replacing the whole item with the answer does not do
         * either — the answers of two parallel PATCHes carry one fresh field each, and
         * the later one would roll the edit of the earlier one back.
         *
         * @param id - Id of the media item.
         * @param patch - The fields of the operation, out of the server's answer.
         */
        applyItemPatch(id: number, patch: Partial<IMediaItem>): void {
            this.invalidatePendingItemsLoad();

            const targetIndex = this.items.findIndex((item) => item.id === id);

            if (targetIndex === -1) {
                return;
            }

            this.items.splice(targetIndex, 1, { ...this.items[targetIndex], ...patch });
        },

        /**
         * Uploads a file into the media library in a single request: the server puts the
         * file into the publish storage and registers its metadata in the database
         * (POST /api/bricks/media/upload). The fate of the file on a refusal is the
         * server's to decide: it deletes the file only when the record is guaranteed not
         * to have been created, and repeats the registration otherwise. The error is
         * passed on to the caller.
         *
         * @param file - The file to upload.
         * @param category - The category to assign; without it the file is uploaded with
         *   no category.
         * @returns A promise of the stored media item.
         */
        async uploadFile(
            file: File,
            category?: string | null,
            optimization?: IBricksMediaOptimization
        ): Promise<IMediaItem> {
            const { apiFetcher } = useApiClient();
            this.uploadingCount += 1;

            try {
                const resolvedCategory =
                    category && category !== ALL_MEDIA_CATEGORIES_FILTER ? category : null;

                const formData = new FormData();
                formData.append('file', file);

                // The field is not sent at all when there is no category: an empty
                // string in a multipart would reach the validator as an invalid slug
                if (resolvedCategory) {
                    formData.append('category', resolvedCategory);
                }

                // The parameters travel only once picked: with no such fields the server
                // takes the defaults of the config, and sending a client copy is pointless
                if (optimization) {
                    formData.append('format', optimization.format);
                    formData.append('quality', String(optimization.quality));
                    formData.append('maxWidth', String(optimization.maxWidth));
                }

                const response = await apiFetcher<IMediaItem>('/api/bricks/media/upload', {
                    method: 'POST',
                    body: formData,
                    // The sending of a file: the server takes videos of up to 100 MB,
                    // and the common write ceiling would break a slow connection in
                    // the middle of a perfectly good upload
                    timeout: BRICKS_MEDIA_UPLOAD_TIMEOUT_MS,
                });

                const mediaItem = normalizeMediaItem(response);

                this.invalidatePendingItemsLoad();
                this.items.unshift(mediaItem);

                return mediaItem;
            } catch (error: unknown) {
                console.error('[Media Store] Upload failed:', error);

                // An upload is checked at once rather than through `endItemOperation`:
                // there is no waiting for silence over the item — on a refusal the id of
                // the record never became known. And only an unknown outcome is worth
                // checking: a definite refusal means the library holds no such file
                if (isRequestTimeoutError(error)) {
                    this.reloadItemsDetached();
                }

                throw this.toWriteError(error, 'POST', t('bricks.media.uploadFailed'));
            } finally {
                this.uploadingCount -= 1;
            }
        },

        /**
         * Deletes a media file in a single request: the server deletes the file of the
         * storage and the metadata of the database (DELETE /api/bricks/media/:id,
         * file-first). The error is passed on to the caller — the item stays in the list
         * and the operation is safe to repeat.
         *
         * @param id - Id of the media file being deleted.
         */
        async removeItem(id: number): Promise<void> {
            const { apiFetcher } = useApiClient();
            const writeOrder = useMediaWriteOrderStore();
            writeOrder.beginItemOperation(id);

            try {
                await apiFetcher(`/api/bricks/media/${encodeURIComponent(id)}/`, {
                    method: 'DELETE',
                });
            } catch (error: unknown) {
                console.error('[Media Store] Failed to delete item:', error);
                this.finishItemOperation(id, true);

                throw this.toWriteError(error, 'DELETE', t('bricks.media.deleteFailed'));
            }

            this.invalidatePendingItemsLoad();
            this.items = this.items.filter((item) => item.id !== id);
            writeOrder.forgetItem(id);
            this.finishItemOperation(id, false);
        },

        /**
         * Updates the category of one particular media file. The error is passed on
         * to the caller: without that a change of category would look applied although
         * the server had turned it down.
         *
         * @param id - Id of the media item.
         * @param category - The new category; null takes it off the file.
         */
        async updateItemCategory(id: number, category: string | null): Promise<void> {
            const { apiFetcher } = useApiClient();

            if (!this.items.some((item) => item.id === id)) {
                return;
            }

            const writeOrder = useMediaWriteOrderStore();
            const writeId = writeOrder.startItemWrite(id, 'category');
            // The generation of the category BEING ASSIGNED: a deletion of any other
            // one does not contradict this PATCH
            const categoryGeneration = writeOrder.readCategoryGeneration(category);
            let response: IMediaItem;

            writeOrder.beginItemOperation(id);

            try {
                response = await apiFetcher<IMediaItem>(
                    `/api/bricks/media/${encodeURIComponent(id)}/`,
                    {
                        method: 'PATCH',
                        body: {
                            category,
                        } satisfies IMediaUpdateCategoryRequest,
                    }
                );
            } catch (error: unknown) {
                console.error('[Media Store] Failed to update category:', error);
                this.finishItemOperation(id, true);

                throw this.toWriteError(error, 'PATCH', t('bricks.media.updateCategoryFailed'));
            }

            // A refusal is always reported to the caller, but only an answer that
            // still holds is APPLIED: the request succeeded, it is its value that went
            // stale
            const isCurrent =
                writeOrder.isCurrentItemWrite(id, 'category', writeId) &&
                categoryGeneration === writeOrder.readCategoryGeneration(category);

            if (isCurrent) {
                this.applyItemPatch(id, { category: normalizeMediaItem(response).category });
            }

            this.finishItemOperation(id, false);
        },

        /**
         * Updates the filename and/or the alt of one media file. The error is passed on
         * to the caller: without that a rename would look applied although the server had
         * turned it down.
         *
         * @param id - Id of the media item.
         * @param meta - The fields being updated (filename, alt).
         */
        async updateItemMeta(id: number, meta: IMediaUpdateMetaRequest): Promise<void> {
            const { apiFetcher } = useApiClient();

            if (!this.items.some((item) => item.id === id)) {
                return;
            }

            // A number is taken for every field being sent: the PATCHes of filename
            // and of alt are independent, and a stale answer of one must not take the
            // edit of the other down — nor the other way round
            const writeOrder = useMediaWriteOrderStore();
            const filenameWriteId =
                meta.filename === undefined ? null : writeOrder.startItemWrite(id, 'filename');
            const altWriteId = meta.alt === undefined ? null : writeOrder.startItemWrite(id, 'alt');
            let response: IMediaItem;

            writeOrder.beginItemOperation(id);

            try {
                response = await apiFetcher<IMediaItem>(
                    `/api/bricks/media/${encodeURIComponent(id)}/`,
                    {
                        method: 'PATCH',
                        body: meta,
                    }
                );
            } catch (error: unknown) {
                console.error('[Media Store] Failed to update meta:', error);
                this.finishItemOperation(id, true);

                throw this.toWriteError(error, 'PATCH', t('bricks.media.updateMetaFailed'));
            }

            const updatedItem = normalizeMediaItem(response);
            const patch: Partial<IMediaItem> = {};

            if (
                filenameWriteId !== null &&
                writeOrder.isCurrentItemWrite(id, 'filename', filenameWriteId)
            ) {
                patch.filename = updatedItem.filename;
            }

            if (altWriteId !== null && writeOrder.isCurrentItemWrite(id, 'alt', altWriteId)) {
                patch.alt = updatedItem.alt;
            }

            // A stale answer applies nothing: the request succeeded, but both of its
            // edits have been overtyped by fresher ones already
            if (Object.keys(patch).length > 0) {
                this.applyItemPatch(id, patch);
            }

            this.finishItemOperation(id, false);
        },

        /**
         * Mirrors the server taking a category off its files after that category was
         * deleted.
         *
         * Lives here rather than in the category store: the list of files belongs to this
         * store, and editing it from the outside would go around the invalidation of the
         * GET in flight — the very thing that keeps the files of a deleted category from
         * dropping out of every filter until a reload.
         *
         * @param slug - The deleted category.
         */
        clearCategoryLocally(slug: string): void {
            this.invalidatePendingItemsLoad();
            // In-flight assignments of THIS category are invalidated: their answer
            // carries a slug that is gone and would bring the deleted category back
            // into the item — exactly what this taking-off guards against. Assignments
            // of other categories do not contradict the deletion and stay in force
            useMediaWriteOrderStore().invalidateCategory(slug);
            this.items = this.items.map((item) =>
                item.category === slug ? { ...item, category: null } : item
            );
        },
    },
});
