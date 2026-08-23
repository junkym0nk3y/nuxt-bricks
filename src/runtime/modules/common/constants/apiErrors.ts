/**
 * Machine-readable rejection codes of `/api/bricks/**` (the `data.code` of the
 * response), shared by every domain — unlike PAGE_CONFLICT_CODES, which concern
 * the writing of a page only.
 *
 * A single source for the server (handlerHelpers) and for the client (the
 * rejection utilities of publish and media): the code selects the localized text,
 * because the server-side message is in English and gives away no details.
 */

/** Rejection codes the client acts upon */
export const BRICKS_API_ERROR_CODES = {
    /**
     * The request was stopped by a server-side time limit (the database
     * `statement_timeout`). Differs from a client-side abort by the waiting
     * ceiling: there the outcome is unknown, here an unfinished write is
     * definitely rolled back.
     */
    statementTimeout: 'STATEMENT_TIMEOUT',
    /**
     * The media library has no category with such a slug: either a typo in the
     * request or it was deleted between the list being shown and the write. The
     * code is needed both by the client (otherwise the user would see the English
     * status text) and by the HTTP adapter — it lets a rejection from an external
     * backend be recognized as a domain one rather than as arbitrary validation.
     */
    unknownMediaCategory: 'UNKNOWN_MEDIA_CATEGORY',
    /**
     * The role of the account does not cover what the path requires. Differs from a
     * 401 in that the session is valid: signing in again changes nothing, and the
     * client has to show "insufficient permissions" rather than the login form.
     */
    insufficientRole: 'INSUFFICIENT_ROLE',
    /**
     * The operation would leave the system without an active administrator
     * (demoting, deactivating or deleting the last one). The client needs a code of
     * its own: the list row shows a lock with exactly this explanation rather than
     * a "conflict".
     */
    lastActiveAdmin: 'LAST_ACTIVE_ADMIN',
    /**
     * An administrator pointed an endpoint meant for other people's accounts at
     * themselves. One's own role and activity cannot be edited at all, and one's own
     * password is changed by the profile endpoint — it demands the current password,
     * and the admin path would bypass that demand, that is, a stolen administrator
     * cookie would change the password by itself.
     */
    selfTargetForbidden: 'SELF_TARGET_FORBIDDEN',
    /**
     * The login is taken (the comparison is case-insensitive, as it is at sign-in).
     * The client needs a code rather than a text: the hint goes under the field of
     * the creation form.
     */
    usernameTaken: 'USERNAME_TAKEN',
    /**
     * Password changing is switched off by the `auth.allowPasswordChange` option.
     * Separate from "no permissions": the request may have full permissions while
     * such an installation has no password form at all — the client has to say that
     * passwords are managed outside rather than offer to try again.
     */
    passwordChangeDisabled: 'PASSWORD_CHANGE_DISABLED',
    /**
     * The current password in the "change my password" form did not match. Not a
     * 401: that would take a person with a working session to the login form (the
     * client interceptor reacts to the status, not to the path) even though the
     * error concerns a single field of the form.
     */
    invalidCurrentPassword: 'INVALID_CURRENT_PASSWORD',
    /**
     * The account creation request arrived without the operation key, or with one
     * that does not look like a key at all. The key is mandatory: without it a
     * repeat after an aborted request cannot be told from a second creation, and
     * that is the whole reason the endpoint has it.
     */
    idempotencyKeyRequired: 'IDEMPOTENCY_KEY_REQUIRED',
    /**
     * The key is known, but the body differs from the one it was first sent with.
     * Answering with the outcome of the first operation would hand back a result
     * that belongs to a different request, so the request is refused instead. The
     * builder never produces this: an edit of any field issues a new key.
     */
    idempotencyKeyReused: 'IDEMPOTENCY_KEY_REUSED',
    /**
     * The first attempt of this operation is still running on the server (the
     * password hash is being computed). The outcome is not known YET — the client
     * has to ask again rather than start a second creation.
     */
    userCreateInProgress: 'USER_CREATE_IN_PROGRESS',
    /**
     * The operation did create an account, and that account has since been deleted.
     * Creating it anew under the same key is exactly what the key forbids, so the
     * client is told the outcome instead: the work is done and undone.
     */
    userCreateResultGone: 'USER_CREATE_RESULT_GONE',
} as const;

/** Locale key of the server-side time limit rejection: one text for every domain */
export const BRICKS_STATEMENT_TIMEOUT_MESSAGE_KEY = 'bricks.common.statementTimeout';
