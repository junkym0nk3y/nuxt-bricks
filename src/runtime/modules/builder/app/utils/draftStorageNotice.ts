/**
 * The once-per-session message about an unreachable draft storage.
 *
 * Shared by everyone who works with that storage: the autosave (the probe on
 * entry and a refused write), the opening of a session and the commit of a saved
 * state (a refused removal). That is why the latch lives here rather than in one
 * of them — otherwise each would report the same breakage in a message of its own.
 */
import type { IDraftStorageNotice, IDraftStorageNoticeOptions } from '../types/draftStorage';

/**
 * Creates the notice about an unreachable draft storage.
 *
 * @param options - Snapshot of the session token (the boundary of the one-time
 * rule) and the showing of the message.
 * @returns A notice latched to the session and stopped when the page is left.
 */
export function createDraftStorageNotice(options: IDraftStorageNoticeOptions): IDraftStorageNotice {
    // The session already told. The latch is on the token rather than on the
    // page instance: moving between builder pages does not unmount the page
    // (a static page key), and a single flag would have warned about the first
    // page opened only. Save as Copy, the other way round, stays the same session
    // — there is nothing to report a second time
    let notifiedSessionToken: number | null = null;

    // The page is still on the screen. Leaving the editor puts the messages out:
    // the last thing the page does is the synchronous flush of the draft, and a
    // refusal of that one would otherwise show a toast over the dashboard
    // already. On top of that the token is invalidated by then (the dispose of
    // the session is registered earlier), so the latch would let such a message
    // through as "a new session"
    let isActive = true;

    return {
        /**
         * Reports the storage as unreachable — at most once per session.
         */
        report(): void {
            if (!isActive) {
                return;
            }

            const currentToken = options.captureSessionToken();

            if (notifiedSessionToken === currentToken) {
                return;
            }

            notifiedSessionToken = currentToken;
            options.notify();
        },

        /**
         * Stops the messages when the page is left.
         */
        stop(): void {
            isActive = false;
        },
    };
}
