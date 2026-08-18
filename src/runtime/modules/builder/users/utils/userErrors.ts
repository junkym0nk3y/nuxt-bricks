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
 * Отказы операций над учёткой по машиночитаемому коду.
 *
 * По коду, а не по статусу: 409 отдают оба краевых правила, и различить «нельзя
 * тронуть последнего администратора» от «это ваша учётка» иначе нечем — а
 * человеку нужно ровно это различие, потому что первое означает «сначала
 * назначьте второго администратора», а второе — «интерфейс показал вам действие,
 * которого нет».
 */
const USER_ACTION_ERROR_KEYS: Record<string, string> = {
    [BRICKS_API_ERROR_CODES.lastActiveAdmin]: 'bricks.users.errors.lastActiveAdmin',
    [BRICKS_API_ERROR_CODES.selfTargetForbidden]: 'bricks.users.errors.selfTarget',
    [BRICKS_API_ERROR_CODES.passwordChangeDisabled]: 'bricks.users.errors.passwordChangeDisabled',
    [BRICKS_API_ERROR_CODES.insufficientRole]: 'bricks.users.errors.insufficientRole',
};

/** Отказы операций над учёткой по статусу — то, что кодом не размечено. */
const USER_ACTION_STATUS_KEYS: Record<number, string> = {
    404: 'bricks.users.errors.userGone',
    429: 'bricks.users.errors.tooManyRequests',
    503: 'bricks.users.errors.serverBusy',
};

/**
 * Коды, означающие, что список в браузере отстал от базы: показанное действие
 * сервер уже не считает возможным.
 *
 * Оба недостижимы через интерфейс (замок и своя строка закрывают их заранее),
 * поэтому их появление само по себе — сигнал устаревшего списка: пока строка
 * была на экране, другой администратор успел поменять роли. Поэтому после них
 * список перечитывается, а не только показывается тост.
 */
const STALE_LIST_ERROR_CODES: ReadonlySet<string> = new Set([
    BRICKS_API_ERROR_CODES.lastActiveAdmin,
    BRICKS_API_ERROR_CODES.selfTargetForbidden,
]);
// #endregion

// #region Methods
/**
 * Читает статус отказа, не спотыкаясь о пустую ошибку: до этих функций доходит
 * всё, что бросил транспорт, включая отменённый запрос без тела.
 *
 * @param error - Ошибка запроса.
 * @returns HTTP-статус или undefined.
 */
function readStatusCode(error: unknown): number | undefined {
    return ((error ?? {}) as TRequestErrorLike).statusCode;
}
// #endregion

/**
 * Логин занят — подсказка встаёт под полем формы создания, а не в общий текст
 * ошибки: занятость относится к одному полю, и человеку нужно исправить именно
 * его.
 *
 * @param error - Ошибка запроса.
 * @returns Логин уже используется другой учёткой.
 */
export function isUsernameTakenError(error: unknown): boolean {
    return getBricksErrorCode(error) === BRICKS_API_ERROR_CODES.usernameTaken;
}

/**
 * Отказ, после которого список обязателен к перечитыванию: краевое правило
 * сервера разошлось с тем, что показано на экране, либо целевой учётки уже нет.
 *
 * @param error - Ошибка запроса.
 * @returns Список в браузере устарел.
 */
export function isStaleListError(error: unknown): boolean {
    const code = getBricksErrorCode(error);

    if (code && STALE_LIST_ERROR_CODES.has(code)) {
        return true;
    }

    return readStatusCode(error) === 404;
}

/**
 * Ключ сообщения об отказе операции над учёткой.
 *
 * Обрыв по потолку ожидания получает свой текст: исход операции при нём
 * неизвестен — сервер мог применить её и не успеть ответить, — поэтому «не
 * удалось, попробуйте снова» было бы неправдой. Вызывающий в этом случае
 * перечитывает список, и человек видит фактическое состояние.
 *
 * @param error - Ошибка запроса.
 * @returns i18n-ключ сообщения.
 */
export function resolveUserActionErrorKey(error: unknown): string {
    if (isRequestTimeoutError(error)) {
        return 'bricks.users.errors.timeout';
    }

    const code = getBricksErrorCode(error);

    if (code && USER_ACTION_ERROR_KEYS[code]) {
        return USER_ACTION_ERROR_KEYS[code];
    }

    const statusCode = readStatusCode(error);

    return (
        (statusCode ? USER_ACTION_STATUS_KEYS[statusCode] : undefined) ??
        'bricks.users.errors.actionFailed'
    );
}

/**
 * Отказ начальной загрузки списка означает, что раздела в этой установке нет
 * вовсе, а не что он временно не отвечает.
 *
 * 404 — ручек нет в сборке или раздел выключен флагом `allowUserManagement`;
 * 403 — роль запроса не администраторская, то есть локальные права разошлись с
 * серверной политикой. Повторять оба бессмысленно: раздел в этом состоянии
 * прячется целиком, а не показывает кнопку «ещё раз».
 *
 * @param error - Ошибка запроса.
 * @returns Раздел недоступен окончательно.
 */
export function isUsersSectionUnavailableError(error: unknown): boolean {
    const statusCode = readStatusCode(error);

    return statusCode === 403 || statusCode === 404;
}
