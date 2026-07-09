// #region Imports
// Types
import type { IAuthLoginFormValues } from '../types/auth';
import type { TRequestErrorLike } from '../../../common/types/bricks-api';

// Utils
import { sanitizeRedirectPath } from '../utils/redirects';
import { createAuthLoginValidationSchema } from '../utils/validationSchema';

// Composables
import { useAuthSession } from './useAuthSession';

// Vue
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Vee-validate
import { useForm } from 'vee-validate';

// Nuxt
import { navigateTo, useRoute } from '#imports';
// #endregion

/** Маппинг statusCode ответа логина → i18n-ключ сообщения. */
const LOGIN_ERROR_KEYS: Record<number, string> = {
    401: 'bricks.auth.errors.invalidCredentials',
    429: 'bricks.auth.errors.tooManyAttempts',
    503: 'bricks.auth.errors.notConfigured',
};

/**
 * Форма страницы логина: vee-validate, сабмит через `useAuthSession().login`,
 * маппинг ошибок по statusCode, успех — переход на санитизированный
 * `?redirect` (защита от open redirect) или /bricks.
 */
export function useAuthLoginForm() {
    // #region Data
    const { t } = useI18n();
    const route = useRoute();
    const { login } = useAuthSession();

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
     * Переводит ошибку запроса логина в локализованное сообщение.
     */
    function resolveLoginErrorMessage(error: unknown): string {
        const statusCode = (error as TRequestErrorLike).statusCode;
        const key = statusCode ? LOGIN_ERROR_KEYS[statusCode] : undefined;

        return t(key ?? 'bricks.auth.errors.loginFailed');
    }

    /**
     * Валидирует форму, логинит и уходит на возвратный путь.
     */
    const submitForm = handleSubmit(async (values) => {
        if (isSubmitting.value) {
            return;
        }

        isSubmitting.value = true;
        generalError.value = '';

        try {
            await login(values.username, values.password);
            await navigateTo(sanitizeRedirectPath(route.query.redirect));
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
