/**
 * Разбор отказов ручек шаблонов по существу: что показать под полем формы, что
 * тостом, а после чего перечитать список.
 */
// #region Imports
// Types
import type { TRequestErrorLike } from '../../../common/types/bricks-api';

// Utils
import { getBricksErrorCode } from '../../../common/utils/main';
import { isRequestTimeoutError } from '../../../common/utils/apiRequestPolicy';

// Constants
import { TEMPLATE_CONFLICT_CODES } from '../../../common/constants/templates';
// #endregion

// #region Data
/** Отказы операций над шаблоном по статусу — то, что кодом не размечено. */
const TEMPLATE_ACTION_STATUS_KEYS: Record<number, string> = {
    403: 'bricks.templates.errors.insufficientRole',
    404: 'bricks.templates.errors.templateGone',
    413: 'bricks.templates.errors.tooLarge',
    503: 'bricks.templates.errors.serverBusy',
};
// #endregion

// #region Methods
/**
 * Читает статус отказа, не спотыкаясь о пустую ошибку: сюда доходит всё, что
 * бросил транспорт, включая отменённый запрос без тела.
 *
 * @param error - Ошибка запроса.
 * @returns HTTP-статус или undefined.
 */
function readStatusCode(error: unknown): number | undefined {
    return ((error ?? {}) as TRequestErrorLike).statusCode;
}
// #endregion

/**
 * Имя шаблона занято — подсказка встаёт под полем имени, а не в общий текст:
 * отказ относится к одному полю. Проверить занятость заранее нечем — список в
 * браузере лишь копия, и имя мог занять другой редактор.
 *
 * @param error - Ошибка запроса.
 * @returns Имя уже используется другим шаблоном.
 */
export function isTemplateNameTakenError(error: unknown): boolean {
    return getBricksErrorCode(error) === TEMPLATE_CONFLICT_CODES.name;
}

/**
 * Ключ сообщения об отказе операции над шаблоном.
 *
 * Обрыв по потолку ожидания получает свой текст: исход неизвестен — сервер мог
 * применить операцию и не успеть ответить, — поэтому «не удалось» было бы
 * неправдой; вызывающий в этом случае перечитывает список.
 *
 * @param error - Ошибка запроса.
 * @returns i18n-ключ сообщения.
 */
export function resolveTemplateActionErrorKey(error: unknown): string {
    if (isRequestTimeoutError(error)) {
        return 'bricks.templates.errors.timeout';
    }

    const statusCode = readStatusCode(error);

    return (
        (statusCode ? TEMPLATE_ACTION_STATUS_KEYS[statusCode] : undefined) ??
        'bricks.templates.errors.actionFailed'
    );
}
