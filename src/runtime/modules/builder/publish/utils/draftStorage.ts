import type { IBricksPageAddress } from '../../../common/types/pageAddress';
import type { IBuilderDraftEntry, TBuilderDraftMigration } from '../types/builderDrafts';
import { getPageAddressKey, toPageAddress } from '../../../common/utils/bricks/pageAddress';
import { normalizeFormState } from './formState';

/**
 * Builds the localStorage key of a builder draft.
 *
 * The key is the address (`…:draft:blog/post`) rather than the name alone: for
 * `/blog/post` and `/news/post` the draft would be shared — the second page,
 * opened alongside, would offer to restore the edits of the first and would smear
 * its own autosave over them. For a page with no prefix the key is the same as the
 * old one, which is why its drafts survive the move to identity by address.
 *
 * @param address - Page address.
 * @returns The key for localStorage.
 */
function buildBuilderDraftKey(address: IBricksPageAddress): string {
    return `bricks-builder:draft:${getPageAddressKey(address)}`;
}

/**
 * The key of the probe write. A namespace of its own rather than
 * `…:draft:<pagename>` — otherwise the probe would take the key of the page
 * carrying that name.
 */
const BUILDER_DRAFT_PROBE_KEY = 'bricks-builder:storage-probe';

/**
 * Checks whether the draft storage is available by writing a probe.
 *
 * By a write specifically: `localStorage` exists both in a private window and with
 * the site data blocked — the refusal arrives only on `setItem`. Without the probe
 * a person would learn that the restoring does not work some 800 ms after the
 * first edit, and might not learn it at all.
 *
 * @returns Whether writing drafts is available.
 */
export function isBuilderDraftStorageAvailable(): boolean {
    // Called from the client only (once the session is ready): on the server
    // there are no drafts at all, and nobody there to tell about them
    if (typeof window === 'undefined') {
        return false;
    }

    try {
        window.localStorage.setItem(BUILDER_DRAFT_PROBE_KEY, '1');
        window.localStorage.removeItem(BUILDER_DRAFT_PROBE_KEY);

        return true;
    } catch (error) {
        console.warn('[Publish Store] Builder draft storage is unavailable:', error);

        return false;
    }
}

/**
 * Returns a builder draft out of localStorage.
 *
 * @param address - Page address.
 */
export function getBuilderDraft(address: IBricksPageAddress): IBuilderDraftEntry | null {
    if (typeof window === 'undefined') {
        return null;
    }

    const key = buildBuilderDraftKey(address);

    // The access to the storage itself is inside the try as well: with the site
    // data blocked `getItem` throws too, and a draft is read from the session
    // bootstrap — an exception from there would bring the opening of the page down
    // whole, while all that would be lost is the restoring of unsaved edits
    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) {
            return null;
        }

        return JSON.parse(raw) as IBuilderDraftEntry;
    } catch (error) {
        console.warn('[Publish Store] Failed to read builder draft:', { key, error });
        return null;
    }
}

/**
 * Saves a builder draft into localStorage.
 *
 * Returns the outcome instead of keeping quiet: a refused write means the
 * restoring after a reload does not work — and a person who considers their edits
 * protected has to learn about that. The autosave mechanism itself is not turned
 * off by it: the ban may be lifted (the quota freed up, the setting changed), and
 * the next attempt will go through.
 *
 * @param draft - Draft data.
 * @returns Whether the draft was written.
 */
export function setBuilderDraft(draft: IBuilderDraftEntry): boolean {
    if (typeof window === 'undefined') {
        return false;
    }

    const normalized: IBuilderDraftEntry = {
        ...draft,
        draftSnapshot: {
            schema: draft.draftSnapshot.schema,
            formState: normalizeFormState(draft.draftSnapshot.formState),
        },
        savedSnapshot: draft.savedSnapshot
            ? {
                  schema: draft.savedSnapshot.schema,
                  formState: normalizeFormState(draft.savedSnapshot.formState),
              }
            : undefined,
    };

    const key = buildBuilderDraftKey(toPageAddress(draft.pagename, draft.urlPrefix));
    try {
        window.localStorage.setItem(key, JSON.stringify(normalized));

        return true;
    } catch (error) {
        console.warn('[Publish Store] Failed to save builder draft:', { key, error });

        return false;
    }
}

/**
 * Removes a builder draft.
 *
 * Returns the outcome: a draft left behind outlives both a save of the page and an
 * explicit "open the saved one" — and on the next visit it offers to restore the
 * state a person has already turned down.
 *
 * @param address - Page address.
 * @returns Whether the draft was removed.
 */
export function removeBuilderDraft(address: IBricksPageAddress): boolean {
    if (typeof window === 'undefined') {
        return false;
    }

    const key = buildBuilderDraftKey(address);

    // The removal is also called after a page has been saved successfully: an
    // exception of a blocked storage would fail the committing of the saved state,
    // even though the page itself is written to the server already
    try {
        window.localStorage.removeItem(key);

        return true;
    } catch (error) {
        console.warn('[Publish Store] Failed to remove builder draft:', { key, error });

        return false;
    }
}

/**
 * Moves a builder draft to a new address.
 *
 * A taken destination key is not overwritten: the draft of another page lies under
 * it, and the move would destroy that one silently. On a refusal the source record
 * stays where it is — the move itself loses nothing. What is left is a conscious
 * trade-off: the autosave of the session will take the new key some 800 ms later
 * anyway, but that is the ordinary "a session owns its key" rather than a quiet
 * substitution during a rename.
 *
 * @param fromAddress - The old address.
 * @param toAddress - The new address.
 */
export function migrateBuilderDraft(
    fromAddress: IBricksPageAddress,
    toAddress: IBricksPageAddress
): TBuilderDraftMigration {
    if (typeof window === 'undefined') {
        return 'nothing-to-migrate';
    }

    const fromKey = buildBuilderDraftKey(fromAddress);
    const toKey = buildBuilderDraftKey(toAddress);

    if (fromKey === toKey) {
        return 'nothing-to-migrate';
    }

    // The read is inside the try as well: the move runs from `renameSession`,
    // which awaits `router.replace`, and an exception from here would tear the
    // navigation itself off
    try {
        const raw = window.localStorage.getItem(fromKey);
        if (!raw) {
            return 'nothing-to-migrate';
        }

        if (window.localStorage.getItem(toKey) !== null) {
            console.warn('[Publish Store] Builder draft migration skipped: target key is taken', {
                fromKey,
                toKey,
            });

            return 'target-taken';
        }

        let parsed: unknown;

        // The parsing gets a `try` of its own: a corrupted record has nothing to
        // do with the availability of the storage, while the shared `catch` below
        // would pass it off as a refusal of the storage — and a person would get
        // a message about a localStorage ban that never happened. There is
        // nothing to move either way: an unreadable draft is restored under no
        // key at all
        try {
            parsed = JSON.parse(raw);
        } catch (error) {
            console.warn('[Publish Store] Builder draft migration skipped: unreadable draft', {
                fromKey,
                error,
            });

            return 'nothing-to-migrate';
        }

        // The shape is checked separately: `null`, a string and a number are all
        // syntactically valid JSON — assigning a field on such a value throws
        // after the parsing, and the outer `catch` would again pass corrupted
        // data off as a refusal of the storage
        if (parsed === null || typeof parsed !== 'object') {
            console.warn(
                '[Publish Store] Builder draft migration skipped: unexpected draft shape',
                {
                    fromKey,
                }
            );

            return 'nothing-to-migrate';
        }

        // Both halves of the address rather than the name alone: a move can be a
        // change of the prefix too, and after one a record carrying the previous
        // `urlPrefix` would count as the draft of another address — the session
        // bootstrap checks the owner of a record
        const draft = parsed as IBuilderDraftEntry;
        draft.pagename = toAddress.pagename;
        draft.urlPrefix = toAddress.urlPrefix;
        window.localStorage.setItem(toKey, JSON.stringify(draft));
        // A `try` of its own is not needed here, but the outcome is: should the
        // write under the new key go through while the removal of the old one does
        // not, the autosave will keep writing under the new key successfully and
        // nobody will learn about the breakage — while the draft under the previous
        // slug stays behind and later offers to restore itself
        window.localStorage.removeItem(fromKey);

        return 'migrated';
    } catch (error) {
        console.warn('[Publish Store] Failed to migrate builder draft:', { error });

        return 'storage-unavailable';
    }
}
