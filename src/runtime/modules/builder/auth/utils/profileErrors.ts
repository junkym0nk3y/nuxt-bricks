// #region Imports
// Types
import type { TRequestErrorLike } from '../../../common/types/bricks-api';

// Utils
import { getBricksErrorCode } from '../../../common/utils/main';
import { isRequestTimeoutError } from '../../../common/utils/apiRequestPolicy';

// Constants
import { BRICKS_API_ERROR_CODES } from '../../../common/constants/apiErrors';
// #endregion

// #region Data
/**
 * Отказы загрузки фото по статусу.
 *
 * Именно по статусу, а не по машиночитаемому коду: ручка аватара отвечает
 * `createError({ statusCode, message })` без `data.code`, то есть различить её
 * отказы можно только статусом. Серверный текст в интерфейс не выводится — он
 * англоязычный («Avatar exceeds 5MB limit»), а человеку нужен локализованный.
 *
 * 400 — общий случай: под ним и «не растр», и «рамка вне изображения», и
 * картинка сверх ста мегапикселей (её `metadata()` не читается вовсе), поэтому
 * текст говорит про файл, а не выдумывает конкретную причину.
 */
const AVATAR_UPLOAD_ERROR_KEYS: Record<number, string> = {
    400: 'bricks.auth.profile.errors.avatarRejected',
    413: 'bricks.auth.profile.errors.avatarTooLarge',
    429: 'bricks.auth.profile.errors.tooManyUploads',
    503: 'bricks.auth.profile.errors.serverBusy',
};

/** Отказы смены своего пароля по статусу (код разбирается отдельно). */
const OWN_PASSWORD_ERROR_KEYS: Record<number, string> = {
    400: 'bricks.auth.profile.errors.passwordRejected',
    429: 'bricks.auth.profile.errors.tooManyAttempts',
    503: 'bricks.auth.profile.errors.serverBusy',
};
// #endregion

/**
 * Ключ сообщения об отказе загрузки или снятия фото.
 *
 * Обрыв по потолку ожидания получает свой текст: исход загрузки при нём
 * неизвестен (сервер мог успеть записать ссылку), и предлагать «попробуйте
 * снова» было бы неправдой — сначала стоит обновить страницу.
 *
 * @param error - Ошибка запроса.
 * @returns i18n-ключ сообщения.
 */
export function resolveAvatarErrorKey(error: unknown): string {
    if (isRequestTimeoutError(error)) {
        return 'bricks.auth.profile.errors.avatarTimeout';
    }

    const statusCode = (error as TRequestErrorLike).statusCode;

    return (
        (statusCode ? AVATAR_UPLOAD_ERROR_KEYS[statusCode] : undefined) ??
        'bricks.auth.profile.errors.avatarFailed'
    );
}

/**
 * Ключ сообщения об отказе сохранения имени.
 *
 * @param error - Ошибка запроса.
 * @returns i18n-ключ сообщения.
 */
export function resolveDisplayNameErrorKey(error: unknown): string {
    if (isRequestTimeoutError(error)) {
        return 'bricks.auth.profile.errors.saveTimeout';
    }

    if ((error as TRequestErrorLike).statusCode === 400) {
        return 'bricks.auth.profile.errors.displayNameRejected';
    }

    return 'bricks.auth.profile.errors.saveFailed';
}

/**
 * Неверный текущий пароль.
 *
 * Ручка отвечает на это 400 с кодом, а не 401, ровно ради этой развилки:
 * клиентский интерцептор реагирует на статус и увёл бы человека с рабочей
 * сессией на форму логина вместо подсказки под одним полем.
 *
 * @param error - Ошибка запроса.
 * @returns Текущий пароль не совпал.
 */
export function isInvalidCurrentPasswordError(error: unknown): boolean {
    return getBricksErrorCode(error) === BRICKS_API_ERROR_CODES.invalidCurrentPassword;
}

/**
 * Смена пароля выключена настройкой установки.
 *
 * Наружу не экспортируется: единственный потребитель — разбор отказов ниже,
 * а форме нужен уже готовый текст, а не повторный разбор ошибки.
 *
 * @param error - Ошибка запроса.
 * @returns Ручки пароля закрыты флагом.
 */
function isPasswordChangeDisabledError(error: unknown): boolean {
    return getBricksErrorCode(error) === BRICKS_API_ERROR_CODES.passwordChangeDisabled;
}

/**
 * Ключ сообщения об отказе смены своего пароля — для случаев, которые не ложатся
 * под поле формы.
 *
 * @param error - Ошибка запроса.
 * @returns i18n-ключ сообщения.
 */
export function resolveOwnPasswordErrorKey(error: unknown): string {
    if (isRequestTimeoutError(error)) {
        return 'bricks.auth.profile.errors.saveTimeout';
    }

    if (isPasswordChangeDisabledError(error)) {
        return 'bricks.auth.profile.errors.passwordChangeDisabled';
    }

    const statusCode = (error as TRequestErrorLike).statusCode;

    return (
        (statusCode ? OWN_PASSWORD_ERROR_KEYS[statusCode] : undefined) ??
        'bricks.auth.profile.errors.passwordFailed'
    );
}
