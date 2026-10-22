/**
 * Local writes into the shared page list — the ones that go AHEAD of the server
 * answer. Today there is one: the optimistic publication flag of the switch in the
 * dashboard.
 *
 * Apart from the store for the reason the rest of `utils/` is: the store dependency
 * arrives as a narrow contract, so the rule about what a rollback is allowed to
 * touch is tested without Pinia (the pattern of `currentPageWrite.ts`).
 */
import type { TPublishedPageSummary } from '../../../common/types/bricks-api';
import type { IPagesListWriteStoreDeps } from '../types/publishStore';

/**
 * Writes the publication flag of a page into the local list before the server has
 * answered.
 *
 * The record is REPLACED rather than edited in place, and the record AS THE LIST NOW
 * HOLDS IT is returned: it is the identity of that value that lets the caller tell
 * later whether its own optimistic write is still the one in the list. A rollback
 * comparing the flag alone would undo a fresh server answer that happens to carry
 * the same value — `syncPageInList` and `loadAllPages` both put NEW objects in, and
 * the person would see the publication state jump back to what it was before
 * somebody else's write.
 *
 * The value is read back out of the list rather than the object just built being
 * returned: the list lives in a Pinia store, that is, behind a reactive proxy, and
 * a read gives the proxy while the built object stays the raw one — the identity
 * check would then never match and the rollback would never happen at all. A read
 * of the same element gives the same proxy every time (Vue caches them per object),
 * so the comparison holds.
 *
 * @param store - Narrow contract of the store.
 * @param id - Page identifier.
 * @param published - The publication flag to show right away.
 * @returns The record put into the list; null — there is no such page.
 */
export function writePagePublishedLocally(
    store: IPagesListWriteStoreDeps,
    id: string | number,
    published: boolean
): TPublishedPageSummary | null {
    const index = store.publishedPages.findIndex((page) => String(page.id) === String(id));

    if (index === -1) {
        return null;
    }

    store.publishedPages.splice(index, 1, { ...store.publishedPages[index], published });

    return store.publishedPages[index];
}
