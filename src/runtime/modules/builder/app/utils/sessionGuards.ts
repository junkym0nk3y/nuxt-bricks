// #region Imports
// Types
import type { ISessionSaveGuardOptions } from '../types/builder';
// #endregion

/**
 * Lets a save through into a consistent session only. While there is no readiness,
 * `startEditingPage` has filled the form and `editingPageId` in already, and the
 * canvas has no schema yet — the PUT would go out with an empty canvas and
 * overwrite the page in the database. On an ordinary load the barrier of the
 * composition root closes that window (the toolbar goes under `inert` until both
 * the session and the loader are done), but a refused bootstrap deliberately leaves
 * the toolbar live: the error screen holds the retry, and Save sits next to it.
 *
 * The rule is moved out of the composition root and into here so that it is
 * checked by behavior: in a template it could only be verified by its text, and
 * such a case stays green over, say, a lost `return`.
 *
 * @param options - Readiness of the session, the save action and the reaction to
 * a refusal.
 * @returns Whether the save was carried out.
 */
export async function runSaveWhenSessionReady(options: ISessionSaveGuardOptions): Promise<boolean> {
    if (!options.isSessionReady()) {
        options.onBlocked();
        return false;
    }

    await options.save();

    return true;
}

/**
 * Wraps an event handler in the readiness rule of the session. Needed where the
 * barriers of the markup do not work: the global `keydown` sits on `window`, so
 * neither the shield nor `inert` stops it, while undo/delete/paste before
 * readiness edit a canvas the incoming schema is about to overwrite.
 *
 * @param isSessionReady - Whether the session is open to a consistent state.
 * @param handler - The handler, called in a consistent session only.
 * @returns The handler with the readiness check.
 */
export function withSessionReadyGuard<TEvent>(
    isSessionReady: () => boolean,
    handler: (event: TEvent) => void
): (event: TEvent) => void {
    return (event: TEvent) => {
        if (!isSessionReady()) {
            return;
        }

        handler(event);
    };
}
