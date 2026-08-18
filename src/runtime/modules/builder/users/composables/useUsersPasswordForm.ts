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
 * Форма «задать пароль другому»: один ввод, генератор и запрос
 * `POST /api/bricks/users/:id/password`.
 *
 * Запрос живёт здесь, а не в общих операциях раздела, по той же причине, по
 * которой загрузку фото профиля выполняет модалка кадрирования: кнопка обязана
 * уйти в состояние отправки и держать модалку открытой до ответа — закройся она
 * раньше, человек не узнал бы, задан ли пароль. Состояние отправки и текст отказа
 * принадлежат тому, кто ждёт ответа.
 *
 * Успех рвёт все сессии учётки, но состояние строки не меняет: список после
 * смены пароля обновлять нечем — ни роль, ни активность, ни имя не изменились.
 *
 * @param options - Учётка-цель и колбэк успеха.
 * @returns Поле пароля, состояние отправки и операции.
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
     * Ставит в поле сгенерированный пароль.
     */
    function generatePassword(): void {
        password.value = generateUserPassword();
        generalError.value = '';
    }

    /**
     * Валидирует форму и задаёт пароль выбранной учётке.
     *
     * Потолок ожидания общий для записей (30 с): ручка считает scrypt-хеш под
     * общим семафором процесса, и короткого потолка ей на занятом сервере не
     * хватит.
     *
     * Обрыв по потолку разбирается как остальные отказы, без сверки со списком:
     * результат смены пароля в списке не виден вовсе — ни одно поле строки от неё
     * не меняется, — поэтому проверить исход клиенту нечем, и текст об этом
     * говорит прямо.
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
     * Возвращает форму к пустому значению — при открытии на другой учётке.
     *
     * Обязательно: оставленный в поле пароль предыдущей учётки был бы задан
     * следующей одним нажатием кнопки.
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
