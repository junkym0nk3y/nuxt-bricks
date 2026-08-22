// #region Imports
// Types
import type { IUsersPasswordFormValues, IUseUsersPasswordFormOptions } from '../types/users';

// Utils
import { createUsersPasswordValidationSchema } from '../utils/validationSchema';
import { generateUserPassword } from '../utils/passwordGenerator';
import { resolveUserActionErrorKey } from '../utils/userErrors';

// Vue
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useApiClient } from '../../../common/composables/useApiClient';

// Constants
import { BRICKS_API_WRITE_TIMEOUT_MS } from '../../../common/constants/apiTimeouts';

// Vee-validate
import { useForm } from 'vee-validate';
// #endregion

/**
 * The "set someone else's password" form: one input, the generator and the
 * `POST /api/bricks/users/:id/password` request.
 *
 * The request lives here rather than among the shared operations of the section, for
 * the same reason the profile photo upload is performed by the cropping modal: the
 * button has to go into its submitting state and hold the modal open until the
 * response — had it closed earlier, a person would not learn whether the password had
 * been set. The submitting state and the text of a refusal belong to whoever is
 * waiting for the response. This form therefore stands outside the row-action queue of
 * `useUsersActions`: what it holds is its own button, not the list.
 *
 * Success tears down every session of the account but changes no state of the row:
 * there is nothing to refresh the list with after a password change — neither the
 * role, nor the activity, nor the name have changed.
 *
 * @param options - The target account and the success callback.
 * @returns The password field, the submitting state and the operations.
 */
export function useUsersPasswordForm(options: IUseUsersPasswordFormOptions) {
    // #region Data
    const { t } = useI18n();
    const { apiFetcher } = useApiClient();

    const validationSchema = createUsersPasswordValidationSchema({
        t: (key, params) => t(key, params ?? {}),
    });

    const { defineField, handleSubmit, resetForm, errors } = useForm<IUsersPasswordFormValues>({
        validationSchema,
        initialValues: { password: '' },
    });

    const [password] = defineField('password');

    const isSubmitting = ref(false);
    const generalError = ref('');
    // #endregion

    // #region Methods
    /**
     * Puts a generated password into the field.
     */
    function generatePassword(): void {
        password.value = generateUserPassword();
        generalError.value = '';
    }

    /**
     * Validates the form and sets the password of the chosen account.
     *
     * The waiting ceiling is the shared one for writes (30 s): the endpoint computes
     * the scrypt hash under the shared semaphore of the process, and the short ceiling
     * would not be enough for it on a busy server.
     *
     * An abort by the ceiling is taken apart like the other refusals, with no check
     * against the list: the result of a password change is not visible in the list at
     * all — not a single field of the row changes because of it — so the client has
     * nothing to verify the outcome by, and the text says so outright.
     */
    const submitForm = handleSubmit(async (values) => {
        const user = options.user.value;

        if (!user || isSubmitting.value) {
            return;
        }

        isSubmitting.value = true;
        generalError.value = '';

        try {
            await apiFetcher(`/api/bricks/users/${user.id}/password`, {
                method: 'POST',
                body: { password: values.password },
                timeout: BRICKS_API_WRITE_TIMEOUT_MS,
            });

            options.onSaved(user);
        } catch (error: unknown) {
            generalError.value = t(resolveUserActionErrorKey(error));
        } finally {
            isSubmitting.value = false;
        }
    });

    /**
     * Brings the form back to an empty value — on an opening for another account.
     *
     * Mandatory: a password of the previous account left in the field would be set for
     * the next one with a single press of the button.
     */
    function resetToEmpty(): void {
        resetForm({ values: { password: '' } });
        generalError.value = '';
    }
    // #endregion

    return {
        password,
        errors,
        generalError,
        isSubmitting,
        generatePassword,
        resetToEmpty,
        submitForm,
    };
}
