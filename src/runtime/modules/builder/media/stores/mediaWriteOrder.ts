/**
 * The order in which the answers to the writes of the media library are applied.
 *
 * Kept apart from `media.ts` along the border of the job: that one owns the list of
 * files and the requests, while here is nothing but the bookkeeping of "which answer
 * still holds". Together they were outgrowing the ceiling on the length of a file,
 * and apart this half is on top of that testable by units without a single request.
 *
 * The store knows nothing about the list of files on purpose: an import back would
 * close a cycle, so `endItemOperation` does not reread the list itself — it tells the
 * caller that a check against the server is due.
 */

// #region Imports
// Types
import type { TMediaItemWriteField } from '../types/media';

// Pinia
import { defineStore } from 'pinia';
// #endregion

// #region Helpers
/**
 * The key of a write number: the item plus the field the write owns.
 *
 * @param id - Id of the media item.
 * @param field - The field of the item.
 * @returns The key in `itemWriteIds`.
 */
function buildItemWriteKey(id: number, field: TMediaItemWriteField): string {
    return `${id}:${field}`;
}
// #endregion

export const useMediaWriteOrderStore = defineStore('bricksMediaWriteOrder', {
    state: () => ({
        // The number of the write that started last, keyed by `<id>:<field>`. Two
        // quick `focusout`s on one field travel as two PATCHes, and the answer of the
        // earlier one, arriving later, puts into the store a value the user has
        // already overtyped. The key carries the field because edits of different
        // fields of one file do not contradict one another — one counter per item
        // would mute the answer of a neighboring edit
        itemWriteIds: {} as Record<string, number>,
        // A generation of EVERY category, by its slug: deleting a category
        // invalidates an in-flight assignment of that very category. Kept apart from
        // `itemWriteIds` because a PATCH that sets a category has not shown it
        // locally before its own answer — by the contents of the list its item cannot
        // be told from the uninvolved ones, while the answer would bring an
        // already-deleted slug back into the gallery. And by the slug rather than by
        // one counter for all of them: a shared one would invalidate a successful
        // assignment of "Backgrounds" over a deletion of "Promo" it has nothing to do
        // with. The records are never deleted: deleting a slug and creating the same
        // one again must not revive an old PATCH
        categoryGenerations: {} as Record<string, number>,
        // How many operations over the item are in flight right now, and whether one
        // of them has been refused. Both are needed together: a refusal of a FRESHER
        // write leaves the success of an earlier one unapplied (an answer counts as
        // stale by the order of the starts, and who won on the server is unknown), so
        // after a refusal the state of the item has to be checked against the server.
        // That check is fired not in the `catch` but once no write over the item is
        // left in flight: otherwise the GET would overtake a PATCH still under way and
        // read the state from before it
        itemActiveCounts: {} as Record<number, number>,
        itemReloadPending: {} as Record<number, boolean>,
    }),

    actions: {
        /**
         * Opens a write of a field of an item and returns its number: by that number
         * the answer decides whether to apply itself. The call itself invalidates the
         * writes of that same field that are in flight at the moment of the call.
         *
         * @param id - Id of the media item.
         * @param field - The field the write owns.
         * @returns The number of the write.
         */
        startItemWrite(id: number, field: TMediaItemWriteField): number {
            const key = buildItemWriteKey(id, field);
            const writeId = (this.itemWriteIds[key] ?? 0) + 1;
            this.itemWriteIds[key] = writeId;

            return writeId;
        },

        /**
         * Whether the write still holds: its number is still the last one on that
         * field.
         *
         * @param id - Id of the media item.
         * @param field - The field the write owns.
         * @param writeId - The number `startItemWrite` handed out.
         * @returns false — the answer is stale and must not be applied.
         */
        isCurrentItemWrite(id: number, field: TMediaItemWriteField, writeId: number): boolean {
            return this.itemWriteIds[buildItemWriteKey(id, field)] === writeId;
        },

        /**
         * The current generation of a category; `null` (taking the category off) has
         * no generation — there is no deleting a category in a way that would make
         * "no category" wrong.
         *
         * @param slug - The category being assigned, or null.
         * @returns The generation, or undefined.
         */
        readCategoryGeneration(slug: string | null): number | undefined {
            return slug === null ? undefined : this.categoryGenerations[slug];
        },

        /**
         * Invalidates the in-flight assignments of a deleted category. Assignments of
         * other categories do not contradict the deletion and stay in force.
         *
         * @param slug - The deleted category.
         */
        invalidateCategory(slug: string): void {
            this.categoryGenerations[slug] = (this.categoryGenerations[slug] ?? 0) + 1;
        },

        /**
         * Drops the write numbers of a deleted item: there is nowhere left to apply
         * their answers, and counters under a nonexistent id would only pile up.
         *
         * @param id - Id of the media item.
         */
        forgetItem(id: number): void {
            const prefix = `${id}:`;

            for (const key of Object.keys(this.itemWriteIds)) {
                if (key.startsWith(prefix)) {
                    delete this.itemWriteIds[key];
                }
            }
        },

        /**
         * Opens an operation over an item.
         *
         * @param id - Id of the media item.
         */
        beginItemOperation(id: number): void {
            this.itemActiveCounts[id] = (this.itemActiveCounts[id] ?? 0) + 1;
        },

        /**
         * Closes an operation over an item.
         *
         * @param id - Id of the media item.
         * @param failed - The operation ended in a refusal.
         * @returns true — the item has seen a refusal and no write is left in flight,
         *   that is, its state is due to be checked against the server.
         */
        endItemOperation(id: number, failed: boolean): boolean {
            const active = (this.itemActiveCounts[id] ?? 1) - 1;

            if (failed) {
                this.itemReloadPending[id] = true;
            }

            if (active > 0) {
                this.itemActiveCounts[id] = active;

                return false;
            }

            delete this.itemActiveCounts[id];

            if (!this.itemReloadPending[id]) {
                return false;
            }

            delete this.itemReloadPending[id];

            return true;
        },
    },
});
