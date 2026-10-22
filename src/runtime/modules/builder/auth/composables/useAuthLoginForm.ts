// #region Imports
// Types
import type { IAuthLoginFormValues } from '../types/auth';
import type { TRequestErrorLike } from '../../../common/types/bricks-api';

// Utils
import { sanitizeRedirectPath } from '../utils/redirects';
import { createAuthLoginValidationSchema } from '../utils/validationSchema';

// Composables
import { useAuthSession } from './useAuthSession';
import { useBricksRoutePaths } from '../../../common/composables/useBricksRoutePaths';

// Vue
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Vee-validate
import { useForm } from 'vee-validate';

// Nuxt
import { navigateTo, useRoute } from '#imports';
// #endregion

/** Mapping of the login answer `statusCode` onto an i18n message key. */
const LOGIN_ERROR_KEYS: Record<number, string> = {
    401: 'bricks.auth.errors.invalidCredentials',
    429: 'bricks.auth.errors.tooManyAttempts',
    503: 'bricks.auth.errors.notConfigured',
};

/**
 * Form of the login page: vee-validate, the submit through
 * `useAuthSession().login`, the mapping of errors by `statusCode`, and on success a
 * navigation to the sanitized `?redirect` (protection against an open redirect) or
 * to the builder dashboard.
 */
export function useAuthLoginForm() {
    // #region Data
    const { t } = useI18n();
    const route = useRoute();
    const { login } = useAuthSession();
    const { builderRootPath } = useBricksRoutePaths();

    const validationSchema = createAuthLoginValidationSchema({ t: (key) => t(key) });

    const { defineField, handleSubmit, errors } = useForm<IAuthLoginFormValues>({
        validationSchema,
        initialValues: { username: '', password: '' },
    });

    const [username] = defineField('username');
    const [password] = defineField('password');

    const isSubmitting = ref(false);
    const generalError = ref('');
    // #endregion

    // #region Methods
    /**
     * Turns a login request error into a localized message.
     */
    function resolveLoginErrorMessage(error: unknown): string {
        const statusCode = (error as TRequestErrorLike).statusCode;
        const key = statusCode ? LOGIN_ERROR_KEYS[statusCode] : undefined;

        return t(key ?? 'bricks.auth.errors.loginFailed');
    }

    /**
     * Validates the form, logs in and leaves for the return path.
     */
    const submitForm = handleSubmit(async (values) => {
        if (isSubmitting.value) {
            return;
        }

        isSubmitting.value = true;
        generalError.value = '';

        try {
            await login(values.username, values.password);
            await navigateTo(sanitizeRedirectPath(route.query.redirect, builderRootPath));
        } catch (error: unknown) {
            generalError.value = resolveLoginErrorMessage(error);
        } finally {
            isSubmitting.value = false;
        }
    });
    // #endregion

    return {
        username,
        password,
        errors,
        isSubmitting,
        generalError,
        submitForm,
    };
}
