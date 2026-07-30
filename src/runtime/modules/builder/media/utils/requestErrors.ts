/**
 * Отказы media-запросов: проверка формы ответа списка и приведение ошибки к
 * пользовательскому виду.
 *
 * Своя копия, а не переиспользование `publish/utils/requestErrors.ts`: media
 * не вправе зависеть от publish (границы `.dependency-cruiser.cjs`), а общее
 * знание — выбор текста по методу — вынесено в политику запросов
 * (`resolveRequestTimeoutMessageKey`), поэтому дублируется только проводка.
 */

// #region Imports
// Types
import type { IMediaListResponse } from '../../../common/types/media';
import type { TTranslateFn } from '../../../common/utils/i18nLabels';

// Utils
import {
    isRequestTimeoutError,
    resolveRequestTimeoutMessageKey,
} from '../../../common/utils/apiRequestPolicy';
import { getBricksErrorMessage, isStatementTimeoutError } from '../../../common/utils/main';

// Constants
import { BRICKS_STATEMENT_TIMEOUT_MESSAGE_KEY } from '../../../common/constants/apiErrors';
// #endregion

/**
 * Проверяет, что ответ списка медиа имеет ожидаемую форму. Проверяется только
 * оболочка: непустой объект с `success: true` и массивом `items`. Валидация
 * каждого поля каждого элемента — отдельная задача, и её отсутствие здесь
 * осознанно.
 *
 * @param value - Тело ответа ручки списка.
 * @returns Ответ пригоден к использованию как список медиа.
 */
export function isMediaListResponse(value: unknown): value is IMediaListResponse {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const response = value as { success?: unknown; items?: unknown };

    return response.success === true && Array.isArray(response.items);
}

/**
 * Выбирает текст отказа: обрыв по потолку ожидания и остановка запроса
 * серверным лимитом времени различаются по существу (в первом случае исход
 * записи неизвестен, во втором она определённо откатана), остальное — сообщение
 * сервера либо fallback.
 *
 * Серверный отказ разбирается по машиночитаемому коду до `getBricksErrorMessage`:
 * иначе пользователь увидел бы англоязычный текст статуса.
 *
 * @param error - Исходная ошибка запроса.
 * @param method - HTTP-метод запроса.
 * @param translate - Функция перевода вызывающего.
 * @param fallbackMessage - Локализованное сообщение на случай молчащей ошибки.
 * @returns Текст для показа пользователю.
 */
function resolveMediaErrorMessage(
    error: unknown,
    method: string,
    translate: TTranslateFn,
    fallbackMessage: string
): string {
    if (isRequestTimeoutError(error)) {
        return translate(resolveRequestTimeoutMessageKey(method));
    }

    if (isStatementTimeoutError(error)) {
        return translate(BRICKS_STATEMENT_TIMEOUT_MESSAGE_KEY);
    }

    return getBricksErrorMessage(error, fallbackMessage);
}

/**
 * Приводит отказ media-запроса к пользовательскому виду: обрыв по потолку
 * ожидания получает честный текст (у записи исход неизвестен), остановка
 * серверным лимитом времени — свой, остальное — сообщение сервера либо
 * переданный fallback.
 *
 * Исходная ошибка сохраняется в `cause`: по ней вызывающий отличает обрыв по
 * потолку от отказа сервера (`isRequestTimeoutError` обходит цепочку), а без
 * проброса обёртка уничтожала бы классификацию.
 *
 * @param error - Исходная ошибка запроса.
 * @param method - HTTP-метод запроса.
 * @param translate - Функция перевода вызывающего.
 * @param fallbackMessage - Локализованное сообщение на случай молчащей ошибки.
 * @returns Ошибка для показа пользователю.
 */
export function toMediaRequestError(
    error: unknown,
    method: string,
    translate: TTranslateFn,
    fallbackMessage: string
): Error {
    return new Error(resolveMediaErrorMessage(error, method, translate, fallbackMessage), {
        cause: error,
    });
}
