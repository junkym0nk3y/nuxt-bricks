// Yup
import { object, string } from 'yup';

interface IAuthValidationSchemaOptions {
    /** Переводчик i18n-ключей (сообщения резолвятся в момент валидации). */
    t: (key: string) => string;
}

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
