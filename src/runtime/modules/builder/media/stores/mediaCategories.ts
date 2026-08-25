/**
 * The store of the media library's categories.
 *
 * Kept apart from `media.ts` along the border of the entity: the categories have
 * endpoints of their own, a list of their own and a request number of their own, they
 * meet the files in not a single call, and together the file was outgrowing the
 * ceiling of 500 lines. Their one tie is the deletion of a category: within the same
 * transaction the server takes it off its files (`category` becomes `null`), and the
 * very same change has to be shown in the list of files already on screen.
 */

// #region Imports
import { defineStore } from 'pinia';
import { translateBricksKey as t } from '../../../common/utils/globalI18n';
import type {
    IMediaCategory,
    IMediaCategoryCreateRequest,
    IMediaCategoryDeleteResponse,
} from '../../../common/types/media';
import { useApiClient } from '../../../common/composables/useApiClient';
import { toCamelCase } from '../../../common/utils/case-transform';
import { isRequestTimeoutError } from '../../../common/utils/apiRequestPolicy';
import { isMediaCategoryListResponse, toMediaRequestError } from '../utils/requestErrors';
import { useMediaStore } from './media';
// #endregion

// #region Helpers
/**
 * The category read in flight — one per instance of the store.
 *
 * A second call waits on it instead of starting a request of its own: the dashboard
 * section is mounted on every switch of the rail, and a quick leave-and-return gave
 * two GETs at once. This is not cosmetics — the second request invalidates the answer
 * of the first one by the request number, and should the second then be refused, the
 * row of tabs is left empty although the first answer had arrived intact.
 *
 * Held outside the state: this is a Promise, and the state of a store is serialized.
 * The key is the store itself rather than the module: a shared Promise would mix up
 * the SSR requests of different users.
 */
const pendingCategoriesLoads = new WeakMap<object, Promise<void>>();
// #endregion

export const useMediaCategoriesStore = defineStore('bricksMediaCategories', {
    state: () => ({
        categories: [] as IMediaCategory[],
        // The number of the request that started last — the same way the media list
        // does it: a local insertion of a tab overtakes a GET in flight, and that
        // GET's answer would otherwise hide the created category or bring back the
        // deleted one
        categoriesRequestId: 0,
        // Whether the whole contents of the tab row have been seen.
        // `categories.length > 0` does not mean that: a created category is put into
        // the list locally, before any GET at all. The difference is there for those
        // who open the media library again (the dashboard section is mounted on every
        // switch) and must not send the same GET on every showing.
        //
        // A refusal does not clear it: the last successful answer stays a trustworthy
        // snapshot even if the next request never got through.
        hasLoadedCategoriesSnapshot: false,
    }),

    actions: {
        /**
         * Loads the categories of the media library.
         *
         * A refusal does not empty the list — for the same reason as in `loadItems`:
         * a row of tabs already on screen outlives a transient refusal, and it is the
         * caller who gets the message.
         */
        async loadCategories(): Promise<void> {
            const pending = pendingCategoriesLoads.get(this);

            if (pending) {
                return pending;
            }

            const request = this.requestCategories();

            pendingCategoriesLoads.set(this, request);

            try {
                await request;
            } finally {
                // Exactly one's own read is taken down: while this one was running, a
                // local write could have invalidated it and started a new one
                if (pendingCategoriesLoads.get(this) === request) {
                    pendingCategoriesLoads.delete(this);
                }
            }
        },

        /**
         * The category read itself. Kept apart from `loadCategories` because that one
         * folds simultaneous calls into a single request.
         */
        async requestCategories(): Promise<void> {
            const { apiFetcher } = useApiClient();
            const requestId = ++this.categoriesRequestId;

            try {
                const response = await apiFetcher<unknown>('/api/bricks/media/categories');

                if (!isMediaCategoryListResponse(response)) {
                    throw new Error(t('bricks.media.categoryListResponseInvalid'));
                }

                if (requestId !== this.categoriesRequestId) {
                    return;
                }

                this.categories = response.items.map((item) => toCamelCase<IMediaCategory>(item));
                // Only here: the answer was accepted, so the row equals the
                // categories as of that answer. A displaced request leaves above
                this.hasLoadedCategoriesSnapshot = true;
            } catch (error: unknown) {
                // The refusal of a displaced request is not reported to the caller: a
                // toast about a stale attempt would cover the result of a fresher one
                if (requestId !== this.categoriesRequestId) {
                    return;
                }

                console.error('[Media Store] Failed to load categories:', error);

                throw toMediaRequestError(error, 'GET', t, t('bricks.media.categoryLoadFailed'));
            }
        },

        /**
         * Invalidates a category request already in flight: its answer knows nothing
         * of a tab inserted or deleted locally.
         */
        invalidatePendingCategoriesLoad(): void {
            this.categoriesRequestId += 1;
            // The read in flight is invalidated, and there is no waiting on it: the
            // next call is obliged to start a request of its own, otherwise it would
            // wait out an answer there is nowhere left to apply
            pendingCategoriesLoads.delete(this);
        },

        /**
         * Starts a reread of the categories and forgets it — for the same reason as
         * with the media list: after a write broke by the waiting ceiling its outcome is
         * unknown, and this is the one chance to see it. A refusal is swallowed here.
         *
         * The read in flight is invalidated first: it could have started BEFORE the
         * broken write, and such an answer knows nothing of that write's outcome —
         * without this the coalescing would slip it in as a trustworthy snapshot, and
         * the row of tabs would stay as it was.
         */
        reloadCategoriesDetached(): void {
            this.invalidatePendingCategoriesLoad();

            this.loadCategories().catch((error: unknown) => {
                console.warn('[Media Store] Categories reload after write timeout failed:', error);
            });
        },

        /**
         * Coerces a refusal of a category write into what is shown to the user. Kept
         * apart from `toWriteError`: that one rereads the list of files, while after a
         * broken POST/DELETE of a category it is the row of tabs that has to be
         * checked — otherwise a created category would stay invisible and a deleted
         * one visible, although the server had applied the operation already.
         *
         * @param error - The original error of the request.
         * @param method - HTTP method of the request.
         * @param fallbackMessage - Localized message for an error that says nothing.
         * @returns The error to show to the user.
         */
        toCategoryWriteError(error: unknown, method: string, fallbackMessage: string): Error {
            if (isRequestTimeoutError(error)) {
                this.reloadCategoriesDetached();
                // The category could have been deleted along with being taken off its
                // files — after that the list of files is not trustworthy either
                useMediaStore().reloadItemsDetached();
            }

            return toMediaRequestError(error, method, t, fallbackMessage);
        },

        /**
         * Creates a category and puts it at the end of the row.
         *
         * The list is not reread: the answer carries the created record whole, and a
         * reread would invalidate its local insertion the same way it happens with the
         * media list (see `invalidatePendingItemsLoad`).
         *
         * @param label - The caption the user typed; the slug is computed by the
         *   nuxt-bricks server (an external backend receives a finished value).
         * @returns The created (or already existing) category.
         */
        async createCategory(label: string): Promise<IMediaCategory> {
            const { apiFetcher } = useApiClient();
            let response: IMediaCategory;

            try {
                response = await apiFetcher<IMediaCategory>('/api/bricks/media/categories', {
                    method: 'POST',
                    body: { label } satisfies IMediaCategoryCreateRequest,
                });
            } catch (error: unknown) {
                console.error('[Media Store] Failed to create category:', error);

                throw this.toCategoryWriteError(
                    error,
                    'POST',
                    t('bricks.media.categoryCreateFailed')
                );
            }

            const category = toCamelCase<IMediaCategory>(response);

            this.invalidatePendingCategoriesLoad();

            const existingIndex = this.categories.findIndex((item) => item.slug === category.slug);

            if (existingIndex === -1) {
                this.categories.push(category);
            } else {
                this.categories.splice(existingIndex, 1, category);
            }

            return category;
        },

        /**
         * Deletes a category; within the same transaction the server takes it off its
         * files, so locally their category is fixed without a request of its own.
         *
         * @param slug - The category being deleted.
         * @returns How many files were left with no category.
         */
        async deleteCategory(slug: string): Promise<number> {
            const { apiFetcher } = useApiClient();
            let response: IMediaCategoryDeleteResponse;

            try {
                response = await apiFetcher<IMediaCategoryDeleteResponse>(
                    `/api/bricks/media/categories/${encodeURIComponent(slug)}`,
                    { method: 'DELETE' }
                );
            } catch (error: unknown) {
                console.error('[Media Store] Failed to delete category:', error);

                throw this.toCategoryWriteError(
                    error,
                    'DELETE',
                    t('bricks.media.categoryDeleteFailed')
                );
            }

            this.invalidatePendingCategoriesLoad();
            this.categories = this.categories.filter((item) => item.slug !== slug);
            // The local mirror of the server taking the category off: without it the
            // files of a deleted category would drop out of every filter until a
            // reload
            useMediaStore().clearCategoryLocally(slug);

            return response.clearedCount ?? 0;
        },
    },
});
