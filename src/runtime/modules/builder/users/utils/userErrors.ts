// #region Imports
// Types
import type { TRequestErrorLike } from '../../../common/types/bricks-api';

// Utils
import { getBricksErrorCode } from '../../../common/utils/main';
import { isRequestTimeoutError } from '../../../common/utils/apiRequestPolicy';

// Constants
import { BRICKS_API_ERROR_CODES } from '../../../common/constants/apiErrors';
// #endregion

// #region Data
/**
 * Refusals of an operation on an account, by machine-readable code.
 *
 * By code rather than by status: both edge rules answer 409, and there is nothing
 * else to tell "the last administrator must not be touched" from "this is your own
 * account" — while a person needs exactly that difference, because the first one
 * means "appoint a second administrator first" and the second one means "the
 * interface showed you an action that does not exist".
 */
const USER_ACTION_ERROR_KEYS: Record<string, string> = {
    [BRICKS_API_ERROR_CODES.lastActiveAdmin]: 'bricks.users.errors.lastActiveAdmin',
    [BRICKS_API_ERROR_CODES.userCreateInProgress]: 'bricks.users.errors.createInProgress',
    [BRICKS_API_ERROR_CODES.userCreateResultGone]: 'bricks.users.errors.createResultGone',
    [BRICKS_API_ERROR_CODES.idempotencyKeyReused]: 'bricks.users.errors.createKeyReused',
    [BRICKS_API_ERROR_CODES.idempotencyKeyRequired]: 'bricks.users.errors.createKeyMissing',
    [BRICKS_API_ERROR_CODES.selfTargetForbidden]: 'bricks.users.errors.selfTarget',
    [BRICKS_API_ERROR_CODES.passwordChangeDisabled]: 'bricks.users.errors.passwordChangeDisabled',
    [BRICKS_API_ERROR_CODES.insufficientRole]: 'bricks.users.errors.insufficientRole',
};

/** Refusals of an operation on an account by status — what carries no code */
const USER_ACTION_STATUS_KEYS: Record<number, string> = {
    404: 'bricks.users.errors.userGone',
    429: 'bricks.users.errors.tooManyRequests',
    503: 'bricks.users.errors.serverBusy',
};

/**
 * The codes meaning that the list in the browser has fallen behind the database:
 * the server no longer considers the shown action possible.
 *
 * Both are unreachable through the interface (the lock and one's own row close them
 * in advance), so their arrival is by itself a signal of a stale list: while the row
 * was on screen, another administrator managed to change the roles. That is why the
 * list is re-read after them rather than only a toast being shown.
 */
const STALE_LIST_ERROR_CODES: ReadonlySet<string> = new Set([
    BRICKS_API_ERROR_CODES.lastActiveAdmin,
    BRICKS_API_ERROR_CODES.selfTargetForbidden,
]);
// #endregion

// #region Methods
/**
 * Reads the refusal status without stumbling over an empty error: everything the
 * transport threw reaches these functions, an aborted request with no body
 * included.
 *
 * @param error - Request error.
 * @returns The HTTP status, or undefined.
 */
function readStatusCode(error: unknown): number | undefined {
    return ((error ?? {}) as TRequestErrorLike).statusCode;
}
// #endregion

/**
 * The username is taken — the hint goes under the field of the creation form
 * rather than into the general error text: being taken concerns one field, and it
 * is that very field a person has to fix.
 *
 * @param error - Request error.
 * @returns The username is already used by another account.
 */
export function isUsernameTakenError(error: unknown): boolean {
    return getBricksErrorCode(error) === BRICKS_API_ERROR_CODES.usernameTaken;
}

/**
 * A refusal after which the list must be re-read: an edge rule of the server has
 * diverged from what is shown on screen, or the target account is already gone.
 *
 * @param error - Request error.
 * @returns The list in the browser is stale.
 */
export function isStaleListError(error: unknown): boolean {
    const code = getBricksErrorCode(error);

    if (code && STALE_LIST_ERROR_CODES.has(code)) {
        return true;
    }

    return readStatusCode(error) === 404;
}

/**
 * The message key for a refused operation on an account.
 *
 * An abort by the waiting ceiling gets a text of its own: under it the outcome of
 * the operation is unknown — the server may have applied it and failed to answer in
 * time — so "it did not work out, try again" would be untrue. What follows differs by
 * operation: the creation form asks for the very same submission again (its operation
 * key makes a repeat safe and turns it into a question about the first attempt),
 * while the other operations re-read the list, and a person sees the actual state.
 *
 * @param error - Request error.
 * @returns The i18n key of the message.
 */
export function resolveUserActionErrorKey(error: unknown): string {
    if (isRequestTimeoutError(error)) {
        return 'bricks.users.errors.timeout';
    }

    const code = getBricksErrorCode(error);

    if (code && USER_ACTION_ERROR_KEYS[code]) {
        return USER_ACTION_ERROR_KEYS[code];
    }

    const statusCode = readStatusCode(error);

    return (
        (statusCode ? USER_ACTION_STATUS_KEYS[statusCode] : undefined) ??
        'bricks.users.errors.actionFailed'
    );
}

/**
 * A refusal of the initial list load that no retry can improve — as opposed to a
 * section that is merely silent for now.
 *
 * 404 — the endpoints are absent from the build or the section is turned off by the
 * `allowUserManagement` flag, that is, the section is not in this installation at all;
 * 403 — the section is there, but the role of the request is not an administrator's,
 * that is, the local rights have diverged from the server policy. Retrying either is
 * pointless: in that state the section hides whole instead of showing a "once more"
 * button.
 *
 * @param error - Request error.
 * @returns The section is not going to answer this caller at all.
 */
export function isUsersSectionUnavailableError(error: unknown): boolean {
    const statusCode = readStatusCode(error);

    return statusCode === 403 || statusCode === 404;
}
