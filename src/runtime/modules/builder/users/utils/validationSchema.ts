// #region Imports
// Types
import type { IUsersValidationSchemaOptions } from '../types/users';

// Constants
import {
    BRICKS_DEFAULT_ADMIN_PASSWORD,
    BRICKS_DISPLAY_NAME_MAX_LENGTH,
    BRICKS_DISPLAY_NAME_PATTERN,
    BRICKS_NEW_USERNAME_MAX_LENGTH,
    BRICKS_NEW_USERNAME_MIN_LENGTH,
    BRICKS_NEW_USERNAME_PATTERN,
    BRICKS_PASSWORD_MAX_LENGTH,
    BRICKS_PASSWORD_MIN_LENGTH,
} from '../../../common/constants/auth';

// Yup
import { boolean, object, string } from 'yup';
// #endregion

/**
 * Builds the yup schema of the account creation form.
 *
 * Every bound is taken from the shared constants rather than rewritten as a number:
 * a client schema that has drifted from the server one either rejects a password the
 * server would have accepted or sends a guaranteed refusal over the network — and in
 * both cases the hint under the field lies. For the same reason the username format
 * is checked with the very pattern the endpoint applies.
 *
 * Whether the username is taken is not checked here at all: the list in the browser
 * is a copy, and between reading it and submitting the form another administrator
 * could have taken that username. Only the server knows this, and its refusal is
 * what goes under the field.
 *
 * @param options - Validation context.
 * @returns The yup schema of the creation form.
 */
export function createUsersCreateValidationSchema(options: IUsersValidationSchemaOptions) {
    const { t } = options;

    return object({
        username: string()
            .required(() => t('bricks.users.validation.usernameRequired'))
            .min(BRICKS_NEW_USERNAME_MIN_LENGTH, () =>
                t('bricks.users.validation.usernameTooShort', {
                    min: BRICKS_NEW_USERNAME_MIN_LENGTH,
                })
            )
            .max(BRICKS_NEW_USERNAME_MAX_LENGTH, () =>
                t('bricks.users.validation.usernameTooLong', {
                    max: BRICKS_NEW_USERNAME_MAX_LENGTH,
                })
            )
            // Case is dropped before the format check, exactly as the server does
            // it: `Anna.Kim` is legitimate input for that same `anna.kim` account,
            // and an "invalid characters" refusal on a capital letter would be untrue
            .test(
                'username-pattern',
                () => t('bricks.users.validation.usernameInvalid'),
                (value) => !value || BRICKS_NEW_USERNAME_PATTERN.test(value.toLowerCase())
            ),
        displayName: string()
            .max(BRICKS_DISPLAY_NAME_MAX_LENGTH, () =>
                t('bricks.users.validation.displayNameTooLong', {
                    max: BRICKS_DISPLAY_NAME_MAX_LENGTH,
                })
            )
            // Control characters: a line break inside a name would break the list
            // row and the profile menu, while invisible characters would make two
            // different names indistinguishable on screen. An empty value passes the
            // check — the name is optional, and without it the username is shown
            .test(
                'no-control-characters',
                () => t('bricks.users.validation.displayNameInvalid'),
                (value) => !value || BRICKS_DISPLAY_NAME_PATTERN.test(value)
            ),
        password: createNewPasswordRule(options),
        role: string().required(),
        isActive: boolean().required(),
    });
}

/**
 * Builds the yup schema of the "set someone else's password" form.
 *
 * There is no current password field here, and there is nothing to validate about one:
 * the endpoint does not ask for it (why — at `users/[id]/password.post.ts`), and the
 * form for one's own password is a different schema against a different endpoint.
 *
 * @param options - Validation context.
 * @returns The yup schema of the password form.
 */
export function createUsersPasswordValidationSchema(options: IUsersValidationSchemaOptions) {
    return object({
        password: createNewPasswordRule(options),
    });
}

// #region Methods
/**
 * The rule for a new password — shared by account creation and by resetting someone
 * else's password: the bounds of both endpoints are the same, and once drifted apart
 * the forms would promise different things about the password of one and the same
 * system.
 *
 * @param options - Validation context.
 * @returns The yup rule for the password string.
 */
function createNewPasswordRule(options: IUsersValidationSchemaOptions) {
    const { t } = options;

    return (
        string()
            .required(() => t('bricks.users.validation.passwordRequired'))
            .min(BRICKS_PASSWORD_MIN_LENGTH, () =>
                t('bricks.users.validation.passwordTooShort', { min: BRICKS_PASSWORD_MIN_LENGTH })
            )
            .max(BRICKS_PASSWORD_MAX_LENGTH, () =>
                t('bricks.users.validation.passwordTooLong', { max: BRICKS_PASSWORD_MAX_LENGTH })
            )
            // The seed default password is banned here as well. The rationale for
            // the ban itself belongs to the endpoint (`requirePassword` in
            // `server/utils/auth/userManagement.ts`) and is not copied: the form
            // refuses the password before the request so that the ban reaches a
            // person as a hint under the field rather than as a bare 400
            .test(
                'not-default-password',
                () => t('bricks.users.validation.passwordIsDefault'),
                (value) => value !== BRICKS_DEFAULT_ADMIN_PASSWORD
            )
    );
}
// #endregion
