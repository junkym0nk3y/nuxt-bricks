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
/** Роль новой учётки по умолчанию — самая ходовая и не дающая полных прав. */
const DEFAULT_NEW_USER_ROLE: TBricksUserRole = 'editor';
// #endregion

/**
 * Пустые значения формы создания.
 *
 * @returns Начальные значения.
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
 * Форма создания учётки: валидация общей схемой, создание через
 * `POST /api/bricks/users`, разбор отказов по существу.
 *
 * Потолок ожидания здесь общий для записей (30 с), а не короткий: ручка считает
 * scrypt-хеш нового пароля под общим семафором процесса, и на занятом сервере
 * ей десяти секунд не хватит — оборванный запрос выглядел бы отказом при
 * созданной учётке.
 *
 * @param options - Колбэк успешного создания (модалку закрывает вызывающий).
 * @returns Поля формы, состояние отправки и операции.
 */
export function useUsersCreateForm(options: IUseUsersCreateFormOptions) {
    // #region Data
    const { t } = useI18n();
    const { apiFetcher } = useApiClient();
    const { users, upsertUser, refreshUsers } = useUsersData();

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
    const generalError = ref('');
    // #endregion

    // #region Methods
    /**
     * Ставит в поле пароля сгенерированное значение.
     *
     * Поле остаётся обычным полем ввода: сгенерированный пароль администратор
     * копирует и передаёт человеку, поэтому он обязан быть видимым и заменяемым
     * вручную, а не жить в скрытом состоянии формы.
     */
    function generatePassword(): void {
        password.value = generateUserPassword();
        generalError.value = '';
    }

    /**
     * Разбирает исход оборванного по потолку ожидания создания.
     *
     * Обрыв — не отказ: сервер мог создать учётку и не успеть ответить, а повтор
     * формы получил бы «логин занят» и выглядел бы противоречием. Поэтому список
     * перечитывается и в нём ищется канонический (приведённый к нижнему регистру)
     * логин: нашёлся — создание состоялось, не нашёлся — форма остаётся с
     * честным «результат неизвестен».
     *
     * @param canonicalUsername - Логин в том виде, в котором его сохранил бы сервер.
     */
    async function reconcileTimedOutCreate(canonicalUsername: string): Promise<void> {
        await refreshUsers();

        const created = users.value.find((user) => user.username === canonicalUsername);

        if (created) {
            options.onCreated(created);
            return;
        }

        generalError.value = t('bricks.users.errors.createTimeout');
    }

    /**
     * Валидирует форму и создаёт учётку.
     *
     * Занятый логин уходит под поле, а не в общий текст ошибки: это единственный
     * отказ формы, относящийся к конкретному полю, и человеку нужно исправить
     * именно его. Проверить занятость заранее нельзя — список в браузере лишь
     * копия, и между его чтением и отправкой логин мог занять другой
     * администратор.
     */
    const submitForm = handleSubmit(async (values) => {
        if (isSubmitting.value) {
            return;
        }

        isSubmitting.value = true;
        generalError.value = '';

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

            upsertUser(response.user);
            options.onCreated(response.user);
        } catch (error: unknown) {
            if (isUsernameTakenError(error)) {
                setFieldError('username', t('bricks.users.errors.usernameTaken'));
                return;
            }

            if (isRequestTimeoutError(error)) {
                await reconcileTimedOutCreate(canonicalUsername);
                return;
            }

            generalError.value = t(resolveUserActionErrorKey(error));
        } finally {
            isSubmitting.value = false;
        }
    });

    /**
     * Возвращает форму к пустым значениям — при повторном открытии модалки.
     */
    function resetToEmpty(): void {
        resetForm({ values: buildEmptyFormValues() });
        generalError.value = '';
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
        generatePassword,
        submitForm,
        resetToEmpty,
    };
}
