import type { IBricksPageAddress } from '../../../common/types/pageAddress';
import type {
    IBuilderDraftEntry,
    TBuilderDraftMigration,
    TBuilderDraftPrincipal,
} from '../types/builderDrafts';
import { getPageAddressKey, toPageAddress } from '../../../common/utils/bricks/pageAddress';
import { normalizeFormState } from './formState';

/**
 * Builds the localStorage key of a builder draft.
 *
 * The key is the principal plus the address (`…:draft:database:7:blog/post`). The
 * address alone is not identity enough twice over: for `/blog/post` and `/news/post`
 * the draft would be shared, and without the principal so would it be for two
 * editors of one browser profile — the second was offered the unfinished work of the
 * first and their autosave smeared over it.
 *
 * A record written under the previous, unscoped key is neither read nor removed: its
 * owner cannot be determined, and handing somebody an unclaimed draft is the very
 * defect the principal closes.
 *
 * @param principal - The owner of the draft.
 * @param address - Page address.
 * @returns The key for localStorage.
 */
function buildBuilderDraftKey(
    principal: TBuilderDraftPrincipal,
    address: IBricksPageAddress
): string {
    return `bricks-builder:draft:${principal}:${getPageAddressKey(address)}`;
}

/**
 * Resolves the owner of the drafts of the current session.
 *
 * `null` means the identity is unknown, and then drafts are not touched at all:
 * falling back onto a shared key would merge the users back together, which is
 * exactly what the principal is here to prevent. In the database mode an unresolved
 * profile also means the role is unknown, and a role like that carries no editing
 * right — there is nothing to autosave anyway.
 *
 * @param isDatabaseMode - Whether the accounts of the database mode are on.
 * @param userId - The id of the signed-in account (database mode only).
 * @returns The owner of the drafts, or null when it cannot be determined.
 */
export function resolveBuilderDraftPrincipal(
    isDatabaseMode: boolean,
    userId: number | null | undefined
): TBuilderDraftPrincipal | null {
    if (!isDatabaseMode) {
        return 'basic';
    }

    if (typeof userId !== 'number') {
        return null;
    }

    return `database:${userId}`;
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
 * @param principal - The owner of the draft; `null` — the owner is unknown, and an
 * unknown owner has no drafts here: reading a record under a shared key would hand
 * one person the unfinished work of another.
 * @param address - Page address.
 */
export function getBuilderDraft(
    principal: TBuilderDraftPrincipal | null,
    address: IBricksPageAddress
): IBuilderDraftEntry | null {
    if (principal === null || typeof window === 'undefined') {
        return null;
    }

    const key = buildBuilderDraftKey(principal, address);

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
 * @param principal - The owner of the draft; with `null` nothing is written — the
 * autosave stops before this call, so a refusal here is the defensive one.
 * @param draft - Draft data.
 * @returns Whether the draft was written.
 */
export function setBuilderDraft(
    principal: TBuilderDraftPrincipal | null,
    draft: IBuilderDraftEntry
): boolean {
    if (principal === null || typeof window === 'undefined') {
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

    const key = buildBuilderDraftKey(principal, toPageAddress(draft.pagename, draft.urlPrefix));
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
 * @param principal - The owner of the draft; with `null` there is no key of this
 * session in the storage, so the removal succeeds having done nothing — a refusal
 * would send a person looking for a storage that never refused.
 * @param address - Page address.
 * @returns Whether the draft was removed.
 */
export function removeBuilderDraft(
    principal: TBuilderDraftPrincipal | null,
    address: IBricksPageAddress
): boolean {
    if (principal === null) {
        return true;
    }

    if (typeof window === 'undefined') {
        return false;
    }

    const key = buildBuilderDraftKey(principal, address);

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
 * @param principal - The owner of the draft; with `null` there is nothing of this
 * session under either key.
 * @param fromAddress - The old address.
 * @param toAddress - The new address.
 */
export function migrateBuilderDraft(
    principal: TBuilderDraftPrincipal | null,
    fromAddress: IBricksPageAddress,
    toAddress: IBricksPageAddress
): TBuilderDraftMigration {
    if (principal === null || typeof window === 'undefined') {
        return 'nothing-to-migrate';
    }

    const fromKey = buildBuilderDraftKey(principal, fromAddress);
    const toKey = buildBuilderDraftKey(principal, toAddress);

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
