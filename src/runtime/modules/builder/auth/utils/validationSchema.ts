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
 * Собирает yup-схему формы логина. Чистая фабрика по образцу
 * `publish/utils/validationSchema.ts` — переводчик передаётся снаружи,
 * сообщения-функции реактивны к смене локали.
 *
 * @param options - Контекст валидации.
 * @returns Yup-схема формы логина.
 */
export function createAuthLoginValidationSchema(options: IAuthValidationSchemaOptions) {
    const { t } = options;

    return object({
        username: string().required(() => t('bricks.auth.validation.usernameRequired')),
        password: string().required(() => t('bricks.auth.validation.passwordRequired')),
    });
}

/**
 * Собирает yup-схему формы «Профиль» (отображаемое имя).
 *
 * Имя необязательно: стёртое поле — просьба показывать логин, и сервер приводит
 * пустую строку к `null`. Границы взяты из общих константы и паттерна, а не
 * переписаны числом: разъехавшись с сервером, форма либо отклоняла бы принятое
 * имя, либо отправляла заведомо отказное.
 *
 * @param options - Контекст валидации.
 * @returns Yup-схема формы профиля.
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
            // Управляющие символы: перенос строки внутри имени сломал бы строку
            // списка и меню, а невидимые символы сделали бы два разных имени
            // неотличимыми на экране. Пустое значение проверку проходит —
            // паттерн применяется только к непустой строке
            .test(
                'no-control-characters',
                () => t('bricks.auth.profile.validation.displayNameInvalid'),
                (value) => !value || BRICKS_DISPLAY_NAME_PATTERN.test(value)
            ),
    });
}

/**
 * Собирает yup-схему формы «Пароль» (смена своего пароля).
 *
 * К ТЕКУЩЕМУ паролю минимальная длина не применяется намеренно: пароль учётке
 * могли задать записью в базу, короче нынешней границы, и требование «не короче
 * восьми» не дало бы такому человеку сменить пароль вовсе. Границы НОВОГО — те
 * же, что на сервере, включая запрет дефолтного пароля сида: «сменить» пароль на
 * тот же самый — не смена, а способ погасить предупреждение, оставив учётку
 * общеизвестной.
 *
 * @param options - Контекст валидации.
 * @returns Yup-схема формы пароля.
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
