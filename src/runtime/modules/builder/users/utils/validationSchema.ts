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
 * Собирает yup-схему формы создания учётки.
 *
 * Все границы берутся из общих констант, а не переписаны числами: клиентская
 * схема, разъехавшаяся с серверной, либо отклоняет пароль, который сервер
 * принял бы, либо гоняет через сеть заведомо отказной запрос — и в обоих случаях
 * подсказка под полем врёт. По той же причине формат логина проверяется тем же
 * паттерном, что применяет ручка.
 *
 * Занятость логина здесь не проверяется вовсе: список в браузере — копия, между
 * его чтением и отправкой формы логин мог занять другой администратор. Это знает
 * только сервер, и его отказ встаёт под поле.
 *
 * @param options - Контекст валидации.
 * @returns Yup-схема формы создания.
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
            // Регистр снимается перед проверкой формата, как это делает сервер:
            // `Anna.Kim` — законный ввод той же учётки `anna.kim`, и отказ
            // «недопустимые символы» на заглавной букве был бы неправдой
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
            // Управляющие символы: перенос строки внутри имени сломал бы строку
            // списка и меню профиля, а невидимые символы сделали бы два разных
            // имени неотличимыми на экране. Пустое значение проверку проходит —
            // имя необязательно, и без него показывается логин
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
 * Собирает yup-схему формы «задать пароль другому».
 *
 * Текущего пароля здесь нет и быть не может: администратор его не знает, а
 * сценарий — восстановление доступа человеку, который свой пароль забыл. Своя
 * форма пароля (вкладка профиля) текущий требует, и это разные ручки.
 *
 * @param options - Контекст валидации.
 * @returns Yup-схема формы пароля.
 */
export function createUsersPasswordValidationSchema(options: IUsersValidationSchemaOptions) {
    return object({
        password: createNewPasswordRule(options),
    });
}

// #region Methods
/**
 * Правило нового пароля — общее для создания учётки и для сброса чужого пароля:
 * границы у обеих ручек одни и те же, и разъехавшись, формы обещали бы разное о
 * пароле одной и той же системы.
 *
 * @param options - Контекст валидации.
 * @returns Yup-правило строки пароля.
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
            // Дефолтный пароль сида запрещён и здесь: выданный администратором, он
            // сделал бы чужую учётку общеизвестной, а распознавание «пароль всё ещё
            // дефолтный» на неё не сработало бы вовсе — оно узнаёт только сидовый
            // хеш, а у заново заданного пароля своя соль
            .test(
                'not-default-password',
                () => t('bricks.users.validation.passwordIsDefault'),
                (value) => value !== BRICKS_DEFAULT_ADMIN_PASSWORD
            )
    );
}
// #endregion
