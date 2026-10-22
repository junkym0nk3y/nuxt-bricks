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
import { generateOperationKey } from '../utils/operationKey';
import { isRequestTimeoutError } from '../../../common/utils/apiRequestPolicy';
import { isUsernameTakenError, resolveUserActionErrorKey } from '../utils/userErrors';

// Vue
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useApiClient } from '../../../common/composables/useApiClient';
import { useUsersData } from './useUsersData';

// Constants
import { BRICKS_API_WRITE_TIMEOUT_MS } from '../../../common/constants/apiTimeouts';
import { BRICKS_IDEMPOTENCY_KEY_HEADER } from '../../../common/constants/auth';

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
 * Every submission of one intention carries the same operation key
 * (`Idempotency-Key`), and that is what makes an abort recoverable: the repeat is not
 * a second creation but a question about the first attempt, and the server answers it
 * with the account it created, with "still running", or with the refusal the first
 * attempt got. Before the key the form could only report what it could see in the
 * list — and a row carrying that login proved nothing, because it could belong to
 * another administrator.
 *
 * @param options - The callback of a successful creation (the caller closes the
 * modal).
 * @returns The fields of the form, the submission state and the operations.
 */
export function useUsersCreateForm(options: IUseUsersCreateFormOptions) {
    // #region Data
    const { t } = useI18n();
    const { apiFetcher } = useApiClient();
    const { upsertUser } = useUsersData();

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
     * The key of the operation the current values are being submitted under.
     *
     * One key per INTENTION rather than per request: every repeat of the same values
     * carries it unchanged, and that is what makes the repeat a question about the
     * first attempt instead of a second creation. An edit of any field — the password
     * included — drops the key, because the changed values are a different intention;
     * that is also what keeps the server from ever meeting one key with two different
     * bodies, which it would have to refuse.
     */
    const idempotencyKey = ref<string | null>(null);
    /**
     * The generation of a submission. The modal is closed during a request too (the
     * cross, Esc and a click on the backdrop do not forbid it), while the next opening
     * resets the form — which means the previous request can finish when its form is
     * already gone. Nothing it returns has anything to do with the clean form: without
     * this counter an abort of the old submission would seal the new one and would show
     * an error about a username the person is no longer typing.
     *
     * Every asynchronous tail checks the counter after its LAST await and before it
     * writes into the state of the form — reading it once per outcome is not enough:
     * a tail that awaits anything after the response of the request would otherwise
     * write the outcome of an abandoned attempt over a form the person may already be
     * filling in.
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
     * Validates the form and creates the account.
     *
     * A taken username goes under the field rather than into the general error text: it
     * is the only refusal of the form that concerns a particular field, and it is that
     * field a person has to fix. Being taken cannot be checked in advance — the list in
     * the browser is only a copy, and between reading it and the submission the
     * username could have been taken by another administrator.
     *
     * The operation key is generated once for the values as they are and kept until
     * they change (`watch` below): a repeat of the same submission therefore reaches
     * the server as the SAME operation, which answers it with the outcome of the first
     * attempt instead of creating a second account. That is what makes an abort by the
     * waiting ceiling recoverable — the form asks a person to submit once more rather
     * than sending them to check the list by hand.
     */
    const submitForm = handleSubmit(async (values) => {
        if (isSubmitting.value) {
            return;
        }

        isSubmitting.value = true;
        generalError.value = '';

        submissionGeneration.value += 1;

        const generation = submissionGeneration.value;
        const canonicalUsername = values.username.trim().toLowerCase();

        idempotencyKey.value = idempotencyKey.value ?? generateOperationKey();

        try {
            const response = await apiFetcher<IUserResponse>('/api/bricks/users', {
                method: 'POST',
                headers: { [BRICKS_IDEMPOTENCY_KEY_HEADER]: idempotencyKey.value },
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

            // An abort leaves the outcome unknown, and the key is what turns that into
            // a question with an answer: the same submission repeated asks the server
            // about the first attempt. The values are kept and the form stays
            // submittable — precisely what used to be forbidden while a repeat risked
            // creating a second account
            if (isRequestTimeoutError(error)) {
                generalError.value = t('bricks.users.errors.createOutcomeUnknown');
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
        isSubmitting.value = false;
        idempotencyKey.value = null;
    }
    // #endregion

    // #region Watchers
    // An edit of ANY field is a different intention, so the key of the previous one is
    // dropped: keeping it would send the changed values under the key of the old ones,
    // and the server — which cannot tell whether the change was deliberate — would
    // either refuse them as "the same key with a different body" or, if only the
    // password changed (it is deliberately absent from the digest), answer with the
    // account created under the FIRST password
    watch([username, displayName, password, role, isActive], () => {
        idempotencyKey.value = null;
    });
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
        generatePassword,
        submitForm,
        resetToEmpty,
    };
}
