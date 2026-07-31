// #region Imports
// Utils
import { withPromiseDeadline } from '../../common/utils/promiseDeadline';

// Constants
import {
    BRICKS_API_READ_TIMEOUT_MS,
    BRICKS_SSR_DEADLINE_MARGIN_MS,
} from '../../common/constants/apiTimeouts';
// #endregion

// #region Methods
/**
 * Ограничивает SSR-lookup страницы по времени.
 *
 * Зачем нужен внешний дедлайн: на SSR относительные URL уходят внутренним
 * вызовом Nitro, а он `AbortSignal` не слушает — то есть сигнал, которым
 * политика запросов держит потолок транспорта, для такого вызова инертен.
 * Зависший обработчик держал бы весь SSR-ответ, и посетитель ждал бы вечно.
 * Гонка обработчик не останавливает, но перестаёт его ждать.
 *
 * Почему с запасом, а не ровно потолок чтения: совпадение границ отдаёт исход
 * гонке. Обработчик мог успеть вернуть собственную ошибку с настоящим статусом
 * и причиной (например, свой таймаут внешнего backend'а), а generic
 * `TimeoutError` внешнего дедлайна её бы затёр. С запасом штатная ошибка
 * доезжает наружу первой, а дедлайн остаётся аварийной стенкой. Плата —
 * зависший lookup завершается на величину запаса позже.
 *
 * Почему только на сервере: на клиенте оба фетчера (`publicPageFetcher` и
 * `apiFetcher`) ставят живой сигнал, накрывающий и заголовки, и чтение тела, —
 * второй таймер там лишний и мешал бы переопределить потолок на вызове.
 *
 * Ошибка помечена именем `TimeoutError`, поэтому её классифицирует тот же
 * `isRequestTimeoutError`, что и обрыв на клиенте.
 *
 * @param operation - Промис lookup'а.
 * @param isServer - Выполняется ли код на сервере (SSR).
 * @returns Промис lookup'а с дедлайном на SSR или он же без изменений на клиенте.
 */
export function withPageLookupDeadline<T>(operation: Promise<T>, isServer: boolean): Promise<T> {
    if (!isServer) {
        return operation;
    }

    return withPromiseDeadline(
        operation,
        BRICKS_API_READ_TIMEOUT_MS + BRICKS_SSR_DEADLINE_MARGIN_MS,
        () => {
            const error = new Error('Bricks page lookup timed out');
            error.name = 'TimeoutError';

            return error;
        }
    );
}
// #endregion
