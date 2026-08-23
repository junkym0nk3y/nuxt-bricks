/**
 * Types of the notice about an unreachable draft storage.
 */

/**
 * Options of the notice factory.
 */
export interface IDraftStorageNoticeOptions {
    /**
     * Snapshot of the token of the current session — the boundary of the one-time
     * rule. Taken as a function rather than as the whole token: the latch needs
     * the value alone, and with it the type does not depend on the contract of the
     * session.
     */
    captureSessionToken: () => number;
    /** Showing the message: the toast belongs to the page, not to the utility. */
    notify: () => void;
}

/**
 * The once-per-session message about an unreachable draft storage.
 */
export interface IDraftStorageNotice {
    /** Reports it unreachable: at most once per session, never after the page is left. */
    report: () => void;
    /** Stops the messages: the page is leaving, there is nobody left to show them to. */
    stop: () => void;
}
