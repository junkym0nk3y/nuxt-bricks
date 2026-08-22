// #region Imports
// Types
import type { TBricksUserRole } from '../../../common/types/auth';
import type {
    IUsersCreateFormValues,
    IUserResponse,
    IUseUsersCreateFormOptions,
} from '../types/users';

// Utils
import { createUsersCreateValidationSchema } from '../utils/validationSchema';
import { generateUserPassword } from '../utils/passwordGenerator';
import { isRequestTimeoutError } from '../../../common/utils/apiRequestPolicy';
import { isUsernameTakenError, resolveUserActionErrorKey } from '../utils/userErrors';

// Vue
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useApiClient } from '../../../common/composables/useApiClient';
import { useUsersData } from './useUsersData';

// Constants
import { BRICKS_API_WRITE_TIMEOUT_MS } from '../../../common/constants/apiTimeouts';

// Vee-validate
import { useForm } from 'vee-validate';
// #endregion

// #region Data
/** The default role of a new account — the most common one, and not a full-rights one */
const DEFAULT_NEW_USER_ROLE: TBricksUserRole = 'editor';
// #endregion

/**
 * The empty values of the creation form.
 *
 * @returns The initial values.
 */
function buildEmptyFormValues(): IUsersCreateFormValues {
    return {
        username: '',
        displayName: '',
        password: '',
        role: DEFAULT_NEW_USER_ROLE,
        isActive: true,
    };
}

/**
 * The account creation form: validation by the shared schema, creation through
 * `POST /api/bricks/users`, every refusal told apart by what it actually means.
 *
 * The waiting ceiling here is the shared one for writes (30 s) rather than the short
 * one: the endpoint computes the scrypt hash of the new password under the shared
 * semaphore of the process, and on a busy server ten seconds are not enough for it —
 * an aborted request would look like a refusal while the account had been created.
 *
 * @param options - The callback of a successful creation (the caller closes the
 * modal).
 * @returns The fields of the form, the submission state and the operations.
 */
export function useUsersCreateForm(options: IUseUsersCreateFormOptions) {
    // #region Data
    const { t } = useI18n();
    const { apiFetcher } = useApiClient();
    const { users, status, upsertUser, refreshUsers } = useUsersData();

    const validationSchema = createUsersCreateValidationSchema({
        t: (key, params) => t(key, params ?? {}),
    });

    const { defineField, handleSubmit, resetForm, setFieldError, errors } =
        useForm<IUsersCreateFormValues>({
            validationSchema,
            initialValues: buildEmptyFormValues(),
        });

    const [username] = defineField('username');
    const [displayName] = defineField('displayName');
    const [password] = defineField('password');
    const [role] = defineField('role');
    const [isActive] = defineField('isActive');

    const isSubmitting = ref(false);
    /**
     * Submission is sealed after an abort by the waiting ceiling — until the form is
     * reset.
     *
     * The text about the abort asks a person not to submit the form again, and that
     * request has to be backed: the server handler is not stopped by a client ceiling,
     * so a repeat starts a SECOND scrypt under the same semaphore and runs into
     * "the username is taken" from its own first submission — precisely the
     * contradiction that made the outcome worth taking apart at all. The form has no
     * safe repeat until the operation gets an identifier sent along with the first POST.
     *
     * It is the submission that is sealed rather than the form as a whole: cancelling
     * and closing keep working, while the next opening of the modal clears the flag
     * together with the values — another account is created from a clean form.
     */
    const isSubmitSealed = ref(false);
    /**
     * The generation of a submission. The modal is closed during a request too (the
     * cross, Esc and a click on the backdrop do not forbid it), while the next opening
     * resets the form — which means the previous request can finish when its form is
     * already gone. Nothing it returns has anything to do with the clean form: without
     * this counter an abort of the old submission would seal the new one and would show
     * an error about a username the person is no longer typing.
     *
     * The counter is read once per outcome, right after the response, and the tail of
     * the timeout branch does not read it again: `reconcileTimedOutCreate` waits for a
     * GET of its own, so a reopening during that GET still ends with the message of the
     * previous attempt standing on a clean form.
     */
    const submissionGeneration = ref(0);
    const generalError = ref('');
    // #endregion

    // #region Methods
    /**
     * Puts a generated value into the password field.
     *
     * The field stays an ordinary input: an administrator copies the generated password
     * and hands it over to a person, so it has to be visible and replaceable by hand
     * rather than living in the hidden state of the form.
     */
    function generatePassword(): void {
        password.value = generateUserPassword();
        generalError.value = '';
    }

    /**
     * Takes apart the outcome of a creation aborted by the waiting ceiling.
     *
     * An abort is neither a refusal nor a success: the server may have created the
     * account and failed to answer in time, and it may just as well have rejected it
     * over a taken username. That is why the branch ONLY re-reads the list and reports
     * the observable state; success is declared exclusively by the response of the POST
     * itself.
     *
     * A row that was found proves no success. There is nothing in the list to check it
     * by: neither a snapshot of the usernames taken before the submission (the list
     * lives in the application state and could have fallen behind the database long
     * before this submission — and then somebody else's account would look new), nor
     * the creation time (a drift between the clocks of the browser and the server moves
     * the border either way), nor a match of the role, the name and the activity (they
     * could have been sent by another administrator, while the password set here is not
     * visible in the list). Declaring such a row one's own would mean closing the form
     * with a success toast about an unrelated account. A proof requires an identifier of
     * the operation, sent along with the first POST and registered by the server.
     *
     * The outcome of the re-read is taken into account: `refreshUsers` throws no refusal
     * (otherwise it would take the dashboard away), and a read that fell leaves the
     * previous cache in place — there is nothing in it to speak about the list by at
     * all.
     *
     * Apart from the outcome: the server handler is not stopped by a client ceiling, so
     * "the row is not visible yet" does not mean it will not be there — which is what
     * the texts warn about instead of offering an immediate repeat.
     *
     * @param canonicalUsername - The username in the form the server would have stored
     * it.
     */
    async function reconcileTimedOutCreate(canonicalUsername: string): Promise<void> {
        await refreshUsers();

        if (status.value !== 'ready') {
            generalError.value = t('bricks.users.errors.createReconcileFailed');
            return;
        }

        const isVisible = users.value.some((user) => user.username === canonicalUsername);

        generalError.value = t(
            isVisible
                ? 'bricks.users.errors.createOutcomeUnknown'
                : 'bricks.users.errors.createStillProcessing'
        );
    }

    /**
     * Validates the form and creates the account.
     *
     * A taken username goes under the field rather than into the general error text: it
     * is the only refusal of the form that concerns a particular field, and it is that
     * field a person has to fix. Being taken cannot be checked in advance — the list in
     * the browser is only a copy, and between reading it and the submission the
     * username could have been taken by another administrator.
     */
    const submitForm = handleSubmit(async (values) => {
        if (isSubmitting.value || isSubmitSealed.value) {
            return;
        }

        isSubmitting.value = true;
        generalError.value = '';

        submissionGeneration.value += 1;

        const generation = submissionGeneration.value;
        const canonicalUsername = values.username.trim().toLowerCase();

        try {
            const response = await apiFetcher<IUserResponse>('/api/bricks/users', {
                method: 'POST',
                body: {
                    username: canonicalUsername,
                    password: values.password,
                    role: values.role,
                    displayName: values.displayName.trim(),
                    isActive: values.isActive,
                },
                timeout: BRICKS_API_WRITE_TIMEOUT_MS,
            });

            // The list is edited in any case: the account has been created, and hiding
            // it from the section merely because the window was closed in time would be
            // a lie. Closing the modal and declaring success, however, would go to the
            // wrong address: the form in front of the person is a different one
            upsertUser(response.user);

            if (generation !== submissionGeneration.value) {
                return;
            }

            options.onCreated(response.user);
        } catch (error: unknown) {
            if (generation !== submissionGeneration.value) {
                return;
            }

            if (isUsernameTakenError(error)) {
                setFieldError('username', t('bricks.users.errors.usernameTaken'));
                return;
            }

            if (isRequestTimeoutError(error)) {
                isSubmitSealed.value = true;
                await reconcileTimedOutCreate(canonicalUsername);
                return;
            }

            generalError.value = t(resolveUserActionErrorKey(error));
        } finally {
            if (generation === submissionGeneration.value) {
                isSubmitting.value = false;
            }
        }
    });

    /**
     * Brings the form back to its empty values — on a repeat opening of the modal.
     */
    function resetToEmpty(): void {
        // The previous submission is declared somebody else's: it may still be in
        // flight — the window is closed during a request too. The submission flags come
        // off with it, otherwise a clean form would meet a person with a disabled button
        // until the end of a request they are no longer waiting for
        submissionGeneration.value += 1;

        resetForm({ values: buildEmptyFormValues() });
        generalError.value = '';
        isSubmitSealed.value = false;
        isSubmitting.value = false;
    }
    // #endregion

    return {
        username,
        displayName,
        password,
        role,
        isActive,
        errors,
        generalError,
        isSubmitting,
        isSubmitSealed,
        generatePassword,
        submitForm,
        resetToEmpty,
    };
}
