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
 * Photo upload failures by status.
 *
 * By status rather than by a machine-readable code: the avatar endpoint answers
 * `createError({ statusCode, message })` without `data.code`, that is, its failures
 * can be told apart by the status only. The server text does not reach the
 * interface — it is English ("Avatar exceeds 5MB limit") while a person needs a
 * localized one.
 *
 * 400 is the general case: it covers "not a raster", and "the frame is outside the
 * image", and a picture above a hundred megapixels (whose `metadata()` cannot be
 * read at all), which is why the text speaks of the file instead of inventing a
 * specific reason.
 */
const AVATAR_UPLOAD_ERROR_KEYS: Record<number, string> = {
    400: 'bricks.auth.profile.errors.avatarRejected',
    413: 'bricks.auth.profile.errors.avatarTooLarge',
    429: 'bricks.auth.profile.errors.tooManyUploads',
    503: 'bricks.auth.profile.errors.serverBusy',
};

/** Own password change failures by status (the code is parsed separately). */
const OWN_PASSWORD_ERROR_KEYS: Record<number, string> = {
    400: 'bricks.auth.profile.errors.passwordRejected',
    429: 'bricks.auth.profile.errors.tooManyAttempts',
    503: 'bricks.auth.profile.errors.serverBusy',
};
// #endregion

/**
 * Message key of a failed photo upload or removal.
 *
 * An abort on the waiting ceiling gets a text of its own: under it the outcome is
 * unknown (the server may have managed to write the new link — or to clear the old
 * one), and offering "try again" would be untrue, refreshing the page comes first.
 * The text of that message speaks of an upload, so on a removal it names the wrong
 * direction of the doubt.
 *
 * @param error - Request error.
 * @returns i18n key of the message.
 */
export function resolveAvatarErrorKey(error: unknown): string {
    if (isRequestTimeoutError(error)) {
        return 'bricks.auth.profile.errors.avatarTimeout';
    }

    const statusCode = (error as TRequestErrorLike).statusCode;

    return (
        (statusCode ? AVATAR_UPLOAD_ERROR_KEYS[statusCode] : undefined) ??
        'bricks.auth.profile.errors.avatarFailed'
    );
}

/**
 * Message key of a failed display name save.
 *
 * @param error - Request error.
 * @returns i18n key of the message.
 */
export function resolveDisplayNameErrorKey(error: unknown): string {
    if (isRequestTimeoutError(error)) {
        return 'bricks.auth.profile.errors.saveTimeout';
    }

    if ((error as TRequestErrorLike).statusCode === 400) {
        return 'bricks.auth.profile.errors.displayNameRejected';
    }

    return 'bricks.auth.profile.errors.saveFailed';
}

/**
 * The current password is wrong.
 *
 * The endpoint answers this with a 400 carrying a code rather than a 401 for
 * exactly this fork: the client interceptor reacts to the status and would take a
 * person with a working session to the login form instead of a hint under a single
 * field.
 *
 * @param error - Request error.
 * @returns The current password did not match.
 */
export function isInvalidCurrentPasswordError(error: unknown): boolean {
    return getBricksErrorCode(error) === BRICKS_API_ERROR_CODES.invalidCurrentPassword;
}

/**
 * The password change is switched off by a setting of the installation.
 *
 * Not exported: the only consumer is the failure parsing below, and the form needs
 * a ready text rather than a second parsing of the error.
 *
 * @param error - Request error.
 * @returns The password endpoints are closed by the flag.
 */
function isPasswordChangeDisabledError(error: unknown): boolean {
    return getBricksErrorCode(error) === BRICKS_API_ERROR_CODES.passwordChangeDisabled;
}

/**
 * Message key of a failed own password change — for the cases that do not fit under
 * a form field.
 *
 * @param error - Request error.
 * @returns i18n key of the message.
 */
export function resolveOwnPasswordErrorKey(error: unknown): string {
    if (isRequestTimeoutError(error)) {
        return 'bricks.auth.profile.errors.saveTimeout';
    }

    if (isPasswordChangeDisabledError(error)) {
        return 'bricks.auth.profile.errors.passwordChangeDisabled';
    }

    const statusCode = (error as TRequestErrorLike).statusCode;

    return (
        (statusCode ? OWN_PASSWORD_ERROR_KEYS[statusCode] : undefined) ??
        'bricks.auth.profile.errors.passwordFailed'
    );
}
