/**
 * Writing the current landing from an editor session: the ordinary save
 * (`publishCurrentPage`) and the save as a copy (`saveCurrentPageAsCopy`). Both
 * operations outlive their session — while the request is in flight a person may
 * open another page — so both take `IPublishOperationOptions` and write into the
 * shared form state only with the consent of the initiator.
 *
 * The store dependency is passed as a narrow contract — the logic is unit-tested
 * without Pinia (the pattern of `pageVersionRestore.ts`).
 */
import type { IBricksSchema } from '../../../common/types/brick';
import type { IPublishedPage, TPublishFormState } from '../../../common/types/bricks-api';
import type { ICurrentPageWriteStoreDeps, IPublishOperationOptions } from '../types/publishStore';
import { isRequestTimeoutError } from '../../../common/utils/apiRequestPolicy';
import { toPageAddress } from '../../../common/utils/bricks/pageAddress';
import { generateCopyPagename } from './slugify';
import { publishPageRequest } from './publishApi';

/**
 * Whether the session the request went out from is still the current one. With no
 * option — yes: the dashboard and the direct calls outside the editor have no
 * session at all.
 *
 * @param options - Options of a writing operation of the store.
 * @returns Whether writing into the shared form state is allowed.
 */
function isInitiatorCurrent(options?: IPublishOperationOptions): boolean {
    return options?.isInitiatorCurrent?.() ?? true;
}

/**
 * Refreshes the shared page list after an attempt to create. Neither a refusal
 * nor a delay affects the result of the caller: on a successful answer the page is
 * in the list already (`syncPageInList` put it there), and on an abort by the
 * timeout the outcome is unknown — then this is the only attempt to see whether
 * the server applied the write.
 *
 * @param store - Narrow contract of the store.
 */
async function refreshPagesAfterPublish(store: ICurrentPageWriteStoreDeps): Promise<void> {
    try {
        await store.loadAllPages();
    } catch (error: unknown) {
        console.warn('[Publish Store] Pages refresh after publish failed:', error);
    }
}

/**
 * Creates a page through the API, puts it into the local list right away and
 * starts a refresh of the whole list.
 *
 * Synchronizing by the response is mandatory rather than a safety net:
 * `loadAllPages` may be devalued by a parallel local write, and then the created
 * page would not be in the list. `startEditingPage(id)` would silently fail to
 * find it after that and leave `editingPageId === null` — the next save would go
 * out as a second creation instead of an update, and opening the new slug from the
 * dashboard would give an empty draft on top of an existing page (the guard of the
 * list is what opened this hole in the first place).
 *
 * The list refresh is **not part of the result of the operation**: it is started
 * and let go. At first its refusal flew out as a refusal to create — the builder
 * showed "the save did not work out", and the retry ran into its own slug as into
 * a taken one; the creation modal did not close; the duplication bred an extra
 * copy. But an `await` with the error caught is not enough either: the write
 * operation counts as unfinished until the return from here, that is, a slow GET
 * would keep the save button blocked and forbid the next write. The request does
 * have a waiting ceiling (the transport policy), but it is an order of magnitude
 * above the write itself — waiting for it here means paying with a blocked button
 * for data the result of the creation does not need.
 *
 * The order is mandatory: `syncPageInList` strictly before the refresh is started.
 * Otherwise the GET starts before the local write, that write devalues it with its
 * own number — and the created page disappears from the list along with the
 * discarded answer.
 *
 * @param store - Narrow contract of the store.
 * @param schema - Landing schema.
 * @param formState - Publish form data.
 * @returns The id of the created page.
 */
export async function runPublishPage(
    store: ICurrentPageWriteStoreDeps,
    schema: IBricksSchema,
    formState: TPublishFormState
): Promise<number> {
    let created: IPublishedPage;

    try {
        created = await publishPageRequest(schema, formState);
    } catch (error: unknown) {
        console.error('[Publish Store] Failed to publish page:', error);

        // An abort by the timeout does not mean the page was not created: the
        // server may have applied the POST and failed to answer in time. The
        // list is refreshed — that is a chance for the created page to show up in
        // the dashboard and to reach the slug occupancy check (otherwise the
        // retry would run into its own slug as into somebody else's), but not a
        // guarantee: the GET goes out immediately and may outrun a still running
        // server-side handler. A guarantee would take an idempotency key, that
        // is, an extension of the server contract. The answer must not be waited
        // for anyway — the message about the outcome has to arrive at once
        if (isRequestTimeoutError(error)) {
            refreshPagesAfterPublish(store);
        }

        throw error;
    }

    store.syncPageInList(created);

    // The promise is deliberately not awaited: the errors are swallowed inside,
    // and the result of the creation does not depend on the refresh. No `void`
    // here — the `no-void` rule
    refreshPagesAfterPublish(store);

    return created.id;
}

/**
 * Publishes or updates the current landing.
 *
 * @param store - Narrow contract of the store.
 * @param schema - Landing schema from the canvas.
 * @param failedMessage - Default message for a refused write.
 * @param options - The check of whether the initiating session is current.
 * @returns The id of the page, or null on an error.
 */
export async function runPublishCurrentPage(
    store: ICurrentPageWriteStoreDeps,
    schema: IBricksSchema,
    failedMessage: string,
    options?: IPublishOperationOptions
): Promise<string | number | null> {
    // The write is claimed before validation runs: validation writes
    // `validationErrors` and `generalError`, so a second submit would manage to
    // overwrite the form messages belonging to an operation already in flight
    const writeId = store.beginWrite();
    if (writeId === null) {
        return null;
    }

    // The `try` opens right after the claim rather than before the request:
    // validation stands between them, and an exception of its own would both
    // leave the write active forever (the buttons blocked until a reload) and fly
    // out past the "an id or null on an error" contract — that is, into an
    // unhandled promise instead of a toast. The form arrives from a localStorage
    // draft among other places (`JSON.parse` with no type checking), so a
    // non-string field reaching the validator is not a hypothesis
    try {
        if (!store.validateCurrentFormState()) {
            return null;
        }

        store.generalError = '';

        if (store.editingPageId !== null) {
            await store.updatePage(store.editingPageId, schema, store.currentFormState);
            store.lastSuccessfulSaveAt = Date.now();
            return store.editingPageId;
        }

        const createdId = await store.publishPage(schema, store.currentFormState);
        store.lastSuccessfulSaveAt = Date.now();
        return createdId;
    } catch (error: unknown) {
        console.error('[Publish Store] publishCurrentPage failed:', error);

        // The message goes into the shared field of the form, that is, into the
        // sidebar of the page open right now: a save of the previous one arriving
        // after the navigation would write its error into somebody else's form
        if (isInitiatorCurrent(options)) {
            store.generalError = (error as Error)?.message || failedMessage;
        }

        return null;
    } finally {
        store.endWrite(writeId);
    }
}

/**
 * Saves the current configuration as a copy of the page; synchronizes the list on
 * its own (with no `loadAllPages()`).
 *
 * @param store - Narrow contract of the store.
 * @param schema - Landing schema from the canvas.
 * @param failedMessage - Default message for a refused write.
 * @param options - The check of whether the initiating session is current.
 * @returns The normalized page of the copy, or null on an error.
 */
export async function runSaveCurrentPageAsCopy(
    store: ICurrentPageWriteStoreDeps,
    schema: IBricksSchema,
    failedMessage: string,
    options?: IPublishOperationOptions
): Promise<IPublishedPage | null> {
    // The write is claimed before the form is substituted: a copy temporarily
    // sets `editingPageId = null` and a pagename of its own, and a second call
    // getting through here would take its "original" off the already substituted
    // state — the rollback would then return the form into the state of the copy
    const writeId = store.beginWrite();
    if (writeId === null) {
        return null;
    }

    const originalFormState = { ...store.currentFormState };
    const originalEditingPageId = store.editingPageId;
    const originalValidationErrors = { ...store.validationErrors };
    const originalGeneralError = store.generalError;

    // Everything after the claim is under one `try`: generating the name of the
    // copy and validating work with a form that arrives from a localStorage draft
    // among other places. An exception of theirs would otherwise leave the write
    // active forever and fly out past the "a page or null on an error" contract —
    // that is, into an unhandled promise instead of a message to the person. The
    // form would stay substituted with the state of the copy on top of that —
    // hence the rollback in `finally`
    try {
        const copyPagename = generateCopyPagename(
            toPageAddress(originalFormState.pagename, originalFormState.urlPrefix),
            (candidate) => store.isAddressAvailable(candidate)
        );
        const copyTitle = originalFormState.title
            ? `${originalFormState.title} (copy)`
            : originalFormState.title;

        store.editingPageId = null;
        store.currentFormState = {
            ...originalFormState,
            pagename: copyPagename,
            title: copyTitle,
            published: false,
            createdAt: '',
            updatedAt: '',
        };
        store.validationErrors = {};
        store.generalError = '';

        if (!store.validateCurrentFormState()) {
            store.generalError = originalGeneralError;
            return null;
        }

        const created = await publishPageRequest(schema, store.currentFormState);
        store.syncPageInList(created);

        if (isInitiatorCurrent(options)) {
            store.generalError = originalGeneralError;
        }

        return created;
    } catch (error: unknown) {
        console.error('[Publish Store] saveCurrentPageAsCopy failed:', error);

        // The copy may have been created — see `runPublishPage`
        if (isRequestTimeoutError(error)) {
            refreshPagesAfterPublish(store);
        }

        // generalError is NOT restored along with the form — the error of the
        // copy has to outlive the rollback and reach the person
        if (isInitiatorCurrent(options)) {
            store.generalError = (error as Error)?.message || failedMessage;
        }

        return null;
    } finally {
        // Every outcome closes the operation, a refused validation and an abort by
        // the timeout included: what the `finally` owes is the release of the write
        // claim, not a statement about whether the copy was created
        store.endWrite(writeId);

        // The form is rolled back only into the session the copy went out from:
        // while the POST was in flight a person may have opened another page, and
        // the rollback would smear the state of the previous one over that page's
        // form (already filled in by the bootstrap), while `switchToSavedPage`
        // would take the route to the slug of the copy
        if (isInitiatorCurrent(options)) {
            store.currentFormState = originalFormState;
            store.editingPageId = originalEditingPageId;
            store.validationErrors = { ...originalValidationErrors };
        }
    }
}
