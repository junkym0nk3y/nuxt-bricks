// #region Imports
// Types
import type { IAuthValidationSchemaOptions } from '../types/auth';

// Constants
import {
    BRICKS_DEFAULT_ADMIN_PASSWORD,
    BRICKS_DISPLAY_NAME_MAX_LENGTH,
    BRICKS_DISPLAY_NAME_PATTERN,
    BRICKS_PASSWORD_MAX_LENGTH,
    BRICKS_PASSWORD_MIN_LENGTH,
} from '../../../common/constants/auth';

// Yup
import { object, string } from 'yup';
// #endregion

/**
 * Assembles the yup schema of the login form. A pure factory shaped after
 * `publish/utils/validationSchema.ts` — the translator is passed in from the
 * outside, so the function-messages stay reactive to a locale change.
 *
 * @param options - Validation context.
 * @returns Yup schema of the login form.
 */
export function createAuthLoginValidationSchema(options: IAuthValidationSchemaOptions) {
    const { t } = options;

    return object({
        username: string().required(() => t('bricks.auth.validation.usernameRequired')),
        password: string().required(() => t('bricks.auth.validation.passwordRequired')),
    });
}

/**
 * Assembles the yup schema of the "Profile" form (the display name).
 *
 * The name is optional: an erased field is a request to show the login, and the
 * server turns an empty string into `null`. The bounds are taken from the shared
 * constant and pattern rather than rewritten as a number: once drifted apart from
 * the server, the form would either reject a name the server accepts or send one
 * bound to be refused.
 *
 * @param options - Validation context.
 * @returns Yup schema of the profile form.
 */
export function createAuthProfileValidationSchema(options: IAuthValidationSchemaOptions) {
    const { t } = options;

    return object({
        displayName: string()
            .max(BRICKS_DISPLAY_NAME_MAX_LENGTH, () =>
                t('bricks.auth.profile.validation.displayNameTooLong', {
                    max: BRICKS_DISPLAY_NAME_MAX_LENGTH,
                })
            )
            // Control characters: a line break inside a name would break the row
            // of the list and of the menu, and invisible characters would make two
            // different names indistinguishable on screen. An empty value passes
            // the check — the pattern applies to a non-empty string only
            .test(
                'no-control-characters',
                () => t('bricks.auth.profile.validation.displayNameInvalid'),
                (value) => !value || BRICKS_DISPLAY_NAME_PATTERN.test(value)
            ),
    });
}

/**
 * Assembles the yup schema of the "Password" form (changing one's own password).
 *
 * The minimum length deliberately does not apply to the CURRENT password: an
 * account may have been given its password by a write into the database, shorter
 * than today's bound, and a "no shorter than eight" requirement would leave such a
 * person unable to change their password at all. The bounds of the NEW one are the
 * same as on the server, the ban on the seed's default password included:
 * "changing" a password to the very same one is not a change but a way to silence
 * the warning while leaving the account publicly known.
 *
 * @param options - Validation context.
 * @returns Yup schema of the password form.
 */
export function createAuthOwnPasswordValidationSchema(options: IAuthValidationSchemaOptions) {
    const { t } = options;

    return object({
        currentPassword: string()
            .required(() => t('bricks.auth.profile.validation.currentPasswordRequired'))
            .max(BRICKS_PASSWORD_MAX_LENGTH, () =>
                t('bricks.auth.profile.validation.passwordTooLong', {
                    max: BRICKS_PASSWORD_MAX_LENGTH,
                })
            ),
        newPassword: string()
            .required(() => t('bricks.auth.profile.validation.newPasswordRequired'))
            .min(BRICKS_PASSWORD_MIN_LENGTH, () =>
                t('bricks.auth.profile.validation.passwordTooShort', {
                    min: BRICKS_PASSWORD_MIN_LENGTH,
                })
            )
            .max(BRICKS_PASSWORD_MAX_LENGTH, () =>
                t('bricks.auth.profile.validation.passwordTooLong', {
                    max: BRICKS_PASSWORD_MAX_LENGTH,
                })
            )
            .test(
                'not-default-password',
                () => t('bricks.auth.profile.validation.passwordIsDefault'),
                (value) => value !== BRICKS_DEFAULT_ADMIN_PASSWORD
            ),
    });
}
