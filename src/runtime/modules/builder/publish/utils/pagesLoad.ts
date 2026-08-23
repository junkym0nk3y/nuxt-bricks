/**
 * Reading the page list: the request itself with the stale answers cut off
 * (`runLoadAllPages`), and the one-off load that asks "do we have a list" rather
 * than "refresh the list" (`ensureAllPagesLoaded`).
 *
 * Apart from the store because the state here is not only the reactive one: an
 * unfinished request lives outside the state (a promise does not serialize into
 * the SSR payload), and the logic of cutting off and retrying is tested without
 * Pinia.
 */
import type { IPagesLoadStoreDeps } from '../types/publishStore';
import { fetchAllPagesRequest } from './publishApi';

/**
 * The unfinished loads, per store instance (on the server there is one of those
 * per request). They are what makes parallel readers — the opening of a builder
 * session and the page selector in the toolbar — wait for one request instead of
 * sending one each.
 */
const pendingPagesLoads = new WeakMap<object, Promise<void>>();

/**
 * How many times the request is repeated until a full server-side snapshot
 * arrives. The retry is needed because `loadAllPages` legitimately finishes
 * without applying a displaced answer (a local write outran it, for one) — the
 * store then holds only the locally known rows, and taking those for a full list
 * is not allowed: opening a session against such a list would take an existing
 * page for a new one. The ceiling is there so that a stream of writes does not
 * turn the waiting into an endless queue.
 */
const PAGES_LOAD_ATTEMPTS = 3;

/**
 * Loads the list of every page and puts it into the store.
 *
 * The error is only thrown: `generalError` is a field of the publish form, and
 * writing there used to carry the text of one page into the open one. The list
 * request goes out of the session bootstrap, so a failed load on an abandoned page
 * used to light an error up in the sidebar of the page already open. Every caller
 * handles the refusal itself: the dashboard with a toast of its own, the session
 * bootstrap with a blocking screen, `toPageWriteError` with the revision conflict,
 * and the refresh after a creation (`runPublishPage`) with a console warning.
 *
 * @param store - Narrow contract of the store.
 */
export async function runLoadAllPages(store: IPagesLoadStoreDeps): Promise<void> {
    const requestId = ++store.pagesRequestId;

    try {
        const pages = await fetchAllPagesRequest();

        // A stale answer does not replace a fresher list: two requests in flight
        // are an ordinary thing (leaving one page for another, a save running
        // alongside an opening), and the order of the answers is not guaranteed.
        // A stale list puts the point lookup by pagename, the slug occupancy
        // check and the dashboard all out of step
        if (requestId !== store.pagesRequestId) {
            return;
        }

        store.publishedPages = pages;
        store.pagesLoadedAt = Date.now();
    } catch (error: unknown) {
        // The refusal of a displaced request is not reported to the caller: the
        // list has been updated by a fresher request already, and the error of
        // the stale one would push the current session bootstrap into a refused
        // state — a blocking screen over a working page
        if (requestId !== store.pagesRequestId) {
            return;
        }

        console.error('[Publish Store] Failed to load pages:', error);
        throw error;
    }
}

/**
 * Guarantees a full page list in the store and lets a load already in flight be
 * waited for. A re-entry with the list loaded returns at once.
 *
 * The error is not swallowed: for the opening of a session a refusal means a
 * blocking screen, for the selector it means the cache is left as it is, and that
 * is the caller's call. Exhausted attempts are a refusal too rather than a quiet
 * success: with a partial list the opening of a session would take an existing
 * page for a new one and put an empty canvas up.
 *
 * @param store - Narrow contract of the store.
 * @param failedMessage - The refusal text for a full list that never arrived.
 */
export async function ensureAllPagesLoaded(
    store: IPagesLoadStoreDeps,
    failedMessage: string
): Promise<void> {
    if (store.pagesLoadedAt !== null) {
        return;
    }

    const pending = pendingPagesLoads.get(store);
    if (pending) {
        await pending;
        return;
    }

    const request = (async () => {
        for (
            let attempt = 0;
            attempt < PAGES_LOAD_ATTEMPTS && store.pagesLoadedAt === null;
            attempt += 1
        ) {
            await store.loadAllPages();
        }

        if (store.pagesLoadedAt === null) {
            throw new Error(failedMessage);
        }
    })();

    pendingPagesLoads.set(store, request);

    try {
        await request;
    } finally {
        // Its own promise only: while it was awaited the slot may have been
        // taken by the next one
        if (pendingPagesLoads.get(store) === request) {
            pendingPagesLoads.delete(store);
        }
    }
}
