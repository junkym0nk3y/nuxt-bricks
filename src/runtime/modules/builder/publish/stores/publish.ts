import { defineStore } from 'pinia';
import type { Composer } from 'vue-i18n';
import { useNuxtApp } from '#imports';
import type { IBricksSchema } from '../../../common/types/brick';
import type {
    IUpdatePagePayload,
    IPublishedPage,
    TPublishedPageSummary,
    TPublishFormState,
} from '../../../common/types/bricks-api';
import type { IPublishOperationOptions } from '../types/publishStore';
import type { IBricksPageAddress } from '../../../common/types/pageAddress';
import { getPageAddressKey, toPageAddress } from '../../../common/utils/bricks/pageAddress';
import { buildDefaultFormState, buildEditFormState, normalizeFormState } from '../utils/formState';
import { beginActiveWrite, endActiveWrite } from '../utils/activeWrites';
import { ensureAllPagesLoaded, runLoadAllPages } from '../utils/pagesLoad';
import { writePagePublishedLocally } from '../utils/pagesListWrite';
import { runCreatePage, runDuplicatePage } from '../utils/pageLibraryWrite';
import { validatePublishFormState } from '../utils/formValidation';
import { requirePageRevision, toPageWriteError } from '../utils/requestErrors';
import { restorePageVersionWithPrecondition } from '../utils/pageVersionRestore';
import {
    runPublishCurrentPage,
    runPublishPage,
    runSaveCurrentPageAsCopy,
} from '../utils/currentPageWrite';
import { updatePageRequest, patchPageRequest, deletePageRequest } from '../utils/publishApi';

/**
 * Translates a key through the global i18n (the store has no setup context).
 * `$i18n` is resolved lazily on every call — safe under any order of the plugins.
 */
function t(key: string): string {
    const i18n = useNuxtApp().$i18n as Composer | undefined;
    return i18n ? i18n.t(key) : key;
}

/**
 * The Pinia store of publication, drafts and loading of the landing pages.
 * The API layer is in `utils/publishApi.ts`, the validation in
 * `utils/formValidation.ts`, the preview in `composables/usePublishPreview.ts`.
 */
export const usePublishStore = defineStore('bricksPublish', {
    state: () => ({
        // The list holds summaries with no schema (the editorial list is light);
        // the full page with its schema is requested by the `fetchPageRequest`
        // point lookup when needed
        publishedPages: [] as TPublishedPageSummary[],
        currentFormState: buildDefaultFormState(),
        validationErrors: {} as Record<string, string>,
        generalError: '',
        // The registry of the unfinished write operations — see `utils/activeWrites`
        activeWriteIds: [] as number[],
        nextWriteId: 0,
        editingPageId: null as string | number | null,
        lastSuccessfulSaveAt: 0,
        // The number of the last list request started — by it the answers that
        // arrived out of the order they went out in are cut off (see loadAllPages)
        pagesRequestId: 0,
        // The moment of the last full answer of the server; `null` — the list was
        // never loaded. Apart from the length of the array: an empty list is
        // legitimate (a new page)
        pagesLoadedAt: null as number | null,
    }),

    getters: {
        /**
         * Whether a write of the current landing is running.
         */
        isSubmitting: (state): boolean => state.activeWriteIds.length > 0,

        /**
         * Finds a page by its identifier.
         */
        getPageById: (state) => (id: string | number) => {
            return state.publishedPages.find((page) => String(page.id) === String(id));
        },

        /**
         * Finds a page by its address. By the address rather than by the name: a
         * name is unique only within its own prefix, and a search by it would
         * return an arbitrary one of the pages sharing that name.
         */
        getPageByAddress: (state) => (address: IBricksPageAddress) => {
            const key = getPageAddressKey(address);

            return state.publishedPages.find(
                (page) => getPageAddressKey(toPageAddress(page.pagename, page.urlPrefix)) === key
            );
        },

        /**
         * Whether the address is free, a possible exclusion by id taken into
         * account.
         */
        isAddressAvailable:
            (state) => (address: IBricksPageAddress, excludeId?: string | number) => {
                const key = getPageAddressKey(address);

                return !state.publishedPages.some(
                    (page) =>
                        getPageAddressKey(toPageAddress(page.pagename, page.urlPrefix)) === key &&
                        String(page.id) !== String(excludeId)
                );
            },
    },

    actions: {
        /**
         * Opens a write operation of the current landing — see `utils/activeWrites`.
         *
         * @returns The operation identifier, or `null` when a write is already
         * running.
         */
        beginWrite(): number | null {
            return beginActiveWrite(this);
        },

        /**
         * Closes a write operation by its identifier.
         *
         * @param writeId - The identifier issued by `beginWrite`.
         */
        endWrite(writeId: number): void {
            endActiveWrite(this, writeId);
        },

        /**
         * Forgets the unfinished operations on a change of the builder session. The
         * request keeps flying meanwhile, and its outcome reaches the person as a
         * toast labeled with the page — but the new page must neither show the
         * indicator of somebody else's write nor wait for its end to be saved.
         */
        resetActiveWrites(): void {
            this.activeWriteIds = [];
        },

        /**
         * Fully replaces the publish form state (when a draft is restored, for one).
         *
         * @param formState - The new form state.
         */
        setCurrentFormState(formState: TPublishFormState): void {
            this.currentFormState = normalizeFormState(formState);
        },

        /**
         * Publishes a new page — see `utils/currentPageWrite.runPublishPage`.
         *
         * @param schema - Landing schema.
         * @param formState - Publish form data.
         * @returns The id of the created page.
         */
        async publishPage(schema: IBricksSchema, formState: TPublishFormState): Promise<number> {
            return await runPublishPage(this, schema, formState);
        },

        /**
         * Writes the publication flag into the local list ahead of the server answer
         * — see `utils/pagesListWrite.writePagePublishedLocally`.
         *
         * @param id - Page identifier.
         * @param published - The publication flag to show right away.
         * @returns The record put into the list; null — there is no such page.
         */
        setPagePublishedLocally(
            id: string | number,
            published: boolean
        ): TPublishedPageSummary | null {
            return writePagePublishedLocally(this, id, published);
        },

        /**
         * Synchronizes a page in the local list: replaces the existing record with
         * the answer of the server (a fresh updatedAt/revision), or adds a new one.
         *
         * @param page - The normalized page from the API answer.
         */
        syncPageInList(page: IPublishedPage): void {
            // The list stores summaries — the schema from a PUT/PATCH answer is
            // not put into the store
            const { schema: _schema, isPreview: _isPreview, ...summary } = page;
            const index = this.publishedPages.findIndex(
                (existing) => String(existing.id) === String(page.id)
            );

            if (index === -1) {
                this.publishedPages = [summary, ...this.publishedPages];
            } else {
                this.publishedPages.splice(index, 1, summary);
            }

            this.invalidatePendingPagesLoad();
        },

        /**
         * Devalues the list requests already in flight. A local write is fresher
         * than any GET that started before it: without this the answer of such a
         * GET used to bring back a list with no copy just created in it and with
         * the previous revision — the page disappeared from the dashboard, and the
         * next save failed with a false 409. On its own the counter ordered a GET
         * only against another GET.
         */
        invalidatePendingPagesLoad(): void {
            this.pagesRequestId += 1;
        },

        /**
         * Updates a page and synchronizes it in the local list. A PUT always goes
         * out with a precondition (`requirePageRevision`): on a conflict it is a
         * 409, the list is refreshed (toPageWriteError), and a retry overwrites
         * knowingly.
         *
         * @param id - Page identifier.
         * @param schema - Landing schema.
         * @param formState - Publish form data.
         */
        async updatePage(
            id: string | number,
            schema: IBricksSchema,
            formState: TPublishFormState
        ): Promise<void> {
            const expectedRevision = requirePageRevision(
                this.getPageById(id),
                t('bricks.publish.toasts.savePageFailed')
            );

            try {
                const normalized = await updatePageRequest(id, schema, formState, expectedRevision);
                this.syncPageInList(normalized);
            } catch (error: unknown) {
                console.error('[Publish Store] Failed to update page:', error);
                throw await toPageWriteError(error, () => this.loadAllPages());
            }
        },

        /**
         * Partially updates a page and synchronizes it in the local list. A
         * precondition conflict (a payload carrying expectedRevision) is handled
         * the way updatePage handles it.
         *
         * @param id - Page identifier.
         * @param payload - Partial update payload.
         */
        async patchPage(id: string | number, payload: IUpdatePagePayload): Promise<IPublishedPage> {
            try {
                const normalized = await patchPageRequest(id, payload);
                this.syncPageInList(normalized);

                return normalized;
            } catch (error: unknown) {
                console.error('[Publish Store] Failed to patch page:', error);
                throw await toPageWriteError(error, () => this.loadAllPages());
            }
        },

        /**
         * Rolls a page back to a version (with a mandatory revision precondition) —
         * see `restorePageVersionWithPrecondition`.
         *
         * @param id - Page identifier.
         * @param versionId - Version identifier.
         */
        async restorePageVersion(id: string | number, versionId: number): Promise<IPublishedPage> {
            return restorePageVersionWithPrecondition(
                this,
                id,
                versionId,
                t('bricks.publish.dashboard.details.versions.toasts.restoreFailed')
            );
        },

        /**
         * Deletes a page from the database and from the local list.
         *
         * @param id - Page identifier.
         */
        async deletePage(id: string | number): Promise<void> {
            try {
                await deletePageRequest(id);

                const index = this.publishedPages.findIndex(
                    (page) => String(page.id) === String(id)
                );
                if (index !== -1) {
                    this.publishedPages.splice(index, 1);
                }

                this.invalidatePendingPagesLoad();
            } catch (error: unknown) {
                console.error('[Publish Store] Failed to delete page:', error);
                // Through the same policy as update/patch/restore: an abort by the
                // timeout does not mean the page was not deleted — a refreshed list
                // shows that, and without it a deleted page would stay in the
                // dashboard and a retry would get a 404
                throw await toPageWriteError(error, () => this.loadAllPages());
            }
        },

        /**
         * Loads the list of every page. The error is only thrown, and who handles
         * it how is decided by `utils/pagesLoad.runLoadAllPages`.
         */
        async loadAllPages(): Promise<void> {
            await runLoadAllPages(this);
        },

        /**
         * Guarantees a full page list without requesting it a second time — see
         * `utils/pagesLoad`. The error is not swallowed: it means different things
         * to the opening of a session and to the page selector.
         */
        async ensurePagesLoaded(): Promise<void> {
            await ensureAllPagesLoaded(this, t('bricks.publish.toasts.loadPageFailed'));
        },

        /**
         * Updates a single field of the current settings.
         *
         * @param field - Field name.
         * @param value - Field value.
         */
        setCurrentFormField<K extends keyof TPublishFormState>(
            field: K,
            value: TPublishFormState[K]
        ): void {
            this.currentFormState = {
                ...this.currentFormState,
                [field]: value,
            };
        },

        /**
         * Resets the current settings to the default values.
         */
        resetCurrentFormState(): void {
            this.currentFormState = buildDefaultFormState();
        },

        /**
         * Clears the validation errors and the general error.
         */
        clearErrors(): void {
            this.validationErrors = {};
            this.generalError = '';
        },

        /**
         * Clears the validation error of one particular field.
         *
         * @param field - A field of the publish form.
         */
        clearValidationError(field: keyof TPublishFormState): void {
            const key = String(field);
            if (!this.validationErrors[key]) {
                return;
            }

            this.validationErrors = Object.fromEntries(
                Object.entries(this.validationErrors).filter(([fieldKey]) => fieldKey !== key)
            );

            if (Object.keys(this.validationErrors).length === 0) {
                this.generalError = '';
            }
        },

        /**
         * Starts a new publication session.
         */
        startNewPublish(): void {
            this.resetCurrentFormState();
            this.editingPageId = null;
            this.clearErrors();
        },

        /**
         * Loads the settings of an existing page and puts the store into the
         * editing mode.
         *
         * @param pageId - Page identifier.
         */
        startEditingPage(pageId: string | number): void {
            const page = this.getPageById(pageId);
            if (!page) {
                console.error('[Publish Store] startEditingPage: page not found', pageId);
                return;
            }

            this.currentFormState = buildEditFormState(page);
            this.editingPageId = pageId;
            this.clearErrors();
        },

        /**
         * Validates the current settings before a preview or a publication.
         *
         * @returns Whether the validation passed.
         */
        validateCurrentFormState(): boolean {
            const { formState, errors } = validatePublishFormState(
                this.currentFormState,
                (address) =>
                    this.isAddressAvailable(
                        address,
                        this.editingPageId !== null ? this.editingPageId : undefined
                    )
            );

            if (formState !== this.currentFormState) {
                this.currentFormState = formState;
            }

            this.validationErrors = errors;
            this.generalError =
                Object.keys(errors).length > 0 ? t('bricks.publish.fillRequired') : '';

            return Object.keys(errors).length === 0;
        },

        /**
         * Publishes or updates the current landing.
         *
         * @param schema - Landing schema from the canvas.
         * @param options - The check of whether the initiating session is current.
         * @returns The id of the page, or null on an error.
         */
        async publishCurrentPage(
            schema: IBricksSchema,
            options?: IPublishOperationOptions
        ): Promise<string | number | null> {
            return await runPublishCurrentPage(
                this,
                schema,
                t('bricks.publish.publishFailed'),
                options
            );
        },

        /**
         * Creates a new draft page (the creation modal of the dashboard) — see
         * `utils/pageLibraryWrite.runCreatePage`. The schema arrives from the
         * caller: a blank canvas or a parsed JSON file.
         *
         * @param schema - Schema of the new page.
         * @param formState - Meta fields of the new page.
         * @returns The id of the created page.
         */
        async createPage(schema: IBricksSchema, formState: TPublishFormState): Promise<number> {
            return await runCreatePage(this, schema, formState);
        },

        /**
         * Duplicates an arbitrary page — see
         * `utils/pageLibraryWrite.runDuplicatePage`.
         *
         * @param id - Identifier of the source page.
         * @returns The id of the created copy.
         */
        async duplicatePage(id: string | number): Promise<number> {
            return await runDuplicatePage(
                this,
                id,
                t('bricks.publish.dashboard.toasts.duplicateFailed')
            );
        },

        /**
         * Saves the current configuration as a copy of the page; synchronizes the
         * list on its own (with no loadAllPages()).
         *
         * @param schema - Landing schema from the canvas.
         * @param options - The check of whether the initiating session is current.
         * @returns The normalized page of the copy, or null on an error.
         */
        async saveCurrentPageAsCopy(
            schema: IBricksSchema,
            options?: IPublishOperationOptions
        ): Promise<IPublishedPage | null> {
            return await runSaveCurrentPageAsCopy(
                this,
                schema,
                t('bricks.publish.copyFailedRetry'),
                options
            );
        },
    },
});
