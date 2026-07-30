import type { Composer } from 'vue-i18n';
import { useNuxtApp } from '#imports';
import { PAGE_CONFLICT_CODES } from '../../../common/constants/publish';
import { BRICKS_STATEMENT_TIMEOUT_MESSAGE_KEY } from '../../../common/constants/apiErrors';
import type { TRequestErrorLike } from '../../../common/types/bricks-api';
import {
    isRequestTimeoutError,
    resolveRequestTimeoutMessageKey,
} from '../../../common/utils/apiRequestPolicy';
import { isStatementTimeoutError } from '../../../common/utils/main';

/**
 * Ошибка API-запроса с сохранённым HTTP-статусом и машиночитаемым кодом
 * конфликта (`data.code` ответа) — по ним вызывающие различают 409-конфликты
 * (occupied pagename, revision mismatch) без разбора текста сообщения.
 *
 * Исходная ошибка сохраняется в `cause`: по ней вызывающие отличают обрыв по
 * таймауту от отказа сервера (`isRequestTimeoutError` обходит цепочку), а без
 * проброса обёртка уничтожала бы классификацию.
 */
export class RequestError extends Error {
    readonly statusCode?: number;
    readonly conflictCode?: string;

    constructor(message: string, statusCode?: number, conflictCode?: string, cause?: unknown) {
        super(message, { cause });
        this.name = 'RequestError';
        this.statusCode = statusCode;
        this.conflictCode = conflictCode;
    }
}

/**
 * Проверяет, что ошибка — конфликт optimistic locking (страница изменена
 * после чтения переданного клиентом expectedRevision). Понимает обе формы:
 * RequestError (обёртка toRequestError) и сырую ошибку ofetch — ту
 * toRequestError возвращает как есть (message уже содержит «/api/»).
 */
export function isRevisionConflictError(error: unknown): boolean {
    if (error instanceof RequestError) {
        return error.conflictCode === PAGE_CONFLICT_CODES.revision;
    }

    return extractConflictCode((error ?? {}) as TRequestErrorLike) === PAGE_CONFLICT_CODES.revision;
}

/**
 * Переводит ключ через глобальный i18n; вне Nuxt-контекста (юнит-тесты)
 * падает обратно на ключ. `$i18n` резолвится лениво: утилиты вызываются
 * вне setup-контекста.
 */
function translate(key: string, fallback?: string): string {
    const i18n = useNuxtApp().$i18n as Composer | undefined;
    return i18n ? i18n.t(key) : (fallback ?? key);
}

/**
 * Возвращает локализованное сообщение «Неизвестная ошибка».
 */
function unknownErrorMessage(): string {
    return translate('bricks.common.unknownError', 'Неизвестная ошибка');
}

/**
 * Возвращает локализованный текст обрыва по таймауту; выбор ключа —
 * за политикой запросов, чтобы правило «чтение повторяемо, запись могла
 * примениться» жило в одном месте на все домены.
 *
 * @param method - HTTP-метод оборванного запроса.
 * @returns Сообщение для пользователя.
 */
function timeoutMessage(method: string): string {
    // Без fallback-строки: дублировать текст локали в коде незачем, а вне
    // Nuxt-контекста (юниты) `translate` отдаёт сам ключ — как у конфликта ревизии
    return translate(resolveRequestTimeoutMessageKey(method));
}

/**
 * Достаёт revision страницы из сводки локального списка для precondition
 * отката версии; бросает понятную ошибку, если страница/revision не найдены.
 * В отличие от update/patch (которые допускают запись без precondition —
 * см. `IPublishedPage.revision`), restore обязан идти с revision всегда,
 * поэтому здесь нет молчаливой деградации.
 *
 * @param page - Сводка страницы из локального списка (или undefined).
 * @param fallbackMessage - Локализованное сообщение об ошибке.
 * @returns Revision страницы.
 */
export function requirePageRevision(
    page: { revision?: number } | undefined,
    fallbackMessage: string
): number {
    if (page?.revision === undefined) {
        throw new Error(fallbackMessage);
    }

    return page.revision;
}

/**
 * Предел ожидания обновления списка перед показом конфликта ревизии. Пять секунд:
 * нормальный refresh успевает, а зависший запрос не превращает конфликт в
 * бессрочный spinner.
 *
 * Это UX-дедлайн, а не потолок транспорта, и он намеренно вдвое короче потолка
 * чтения: показать конфликт нужно раньше, чем оборвётся сам запрос.
 */
const PAGE_CONFLICT_REFRESH_TIMEOUT_MS = 5000;

/**
 * Ждёт обновления списка перед показом конфликта, но не дольше дедлайна.
 *
 * Ответ здесь нужен по существу — с ним повторная попытка уйдёт со свежей
 * revision, — поэтому в отличие от освежения после создания (`currentPageWrite`)
 * запрос не просто отпускается. Но и ждать его до потолка транспорта нельзя: до
 * возврата отсюда не отработает `finally`, снимающий общий `isSubmitting`, то
 * есть медленный GET блокировал бы сохранение и в той сессии, куда пользователь
 * успел уйти. Отказ гасится по той же причине, что и раньше: конфликт
 * показываем в любом случае.
 *
 * Размен по истечении дедлайна: конфликт показан со старой revision, и немедленный
 * повтор может получить второй 409. Сам запрос при этом продолжает лететь и
 * обновит список позже — а поздний ответ уже не затрёт локальные записи, их
 * отсекает счётчик `pagesRequestId`.
 *
 * @param refreshPages - Колбэк обновления списка страниц.
 */
async function refreshPagesWithinDeadline(refreshPages: () => Promise<void>): Promise<void> {
    let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
    const deadline = new Promise<void>((resolve) => {
        deadlineTimer = setTimeout(resolve, PAGE_CONFLICT_REFRESH_TIMEOUT_MS);
    });

    try {
        await Promise.race([refreshPages(), deadline]);
    } catch {
        // best-effort: не смогли обновить список — конфликт всё равно показываем
    } finally {
        if (deadlineTimer !== null) {
            clearTimeout(deadlineTimer);
        }
    }
}

/**
 * Запускает обновление списка и отпускает его: вызывающему нужен сам факт
 * запуска, а не результат — и результат тут ничего не гарантирует, запрос
 * способен обогнать незавершённую серверную запись. Отказ гасится здесь же —
 * иначе реджект ушёл бы в необслуженный промис.
 *
 * @param refreshPages - Колбэк обновления списка страниц.
 */
function refreshPagesDetached(refreshPages: () => Promise<void>): void {
    // `void` не пишем — правило `no-void` в oxlint
    refreshPages().catch((error: unknown) => {
        console.warn('[Publish Store] Pages refresh after write timeout failed:', error);
    });
}

/**
 * Приводит ошибку записи страницы к пользовательскому виду: конфликт
 * optimistic locking превращается в локализованное сообщение, а перед этим
 * обновляется список страниц (свежие revision) — повторное сохранение уйдёт с
 * актуальным precondition и осознанно перезапишет чужие изменения. Обновление
 * ограничено дедлайном, см. `refreshPagesWithinDeadline`. Обрыв по таймауту —
 * своя ветка: там обновление отпускается без ожидания. Прочие ошибки
 * возвращаются как есть.
 *
 * @param error - Исходная ошибка запроса.
 * @param refreshPages - Колбэк обновления списка страниц.
 * @returns Ошибка для показа пользователю.
 */
export async function toPageWriteError(
    error: unknown,
    refreshPages: () => Promise<void>
): Promise<Error> {
    // Обрыв записи по таймауту оставляет исход неизвестным, поэтому список
    // обновляется: это единственная попытка увидеть, применилась ли операция —
    // но не доказательство. GET уходит немедленно и может обогнать ещё
    // работающий серверный handler, вернув прежний список; выяснить исход
    // наверняка можно только idempotency key'ем, то есть расширением серверного
    // контракта. Результат обновления в отказ не входит и ждать его нельзя:
    // сообщение об исходе должно дойти сразу, а не через ещё один потолок чтения
    if (isRequestTimeoutError(error)) {
        refreshPagesDetached(refreshPages);

        return error instanceof Error ? error : new Error(String(error));
    }

    if (!isRevisionConflictError(error)) {
        return error instanceof Error ? error : new Error(String(error));
    }

    await refreshPagesWithinDeadline(refreshPages);

    return new Error(translate('bricks.publish.toasts.revisionConflict'));
}

/**
 * Достаёт машиночитаемый код конфликта из ошибки ofetch: h3 сериализует
 * `createError({ data })` в тело ответа, ofetch кладёт тело в `error.data` —
 * наш код оказывается в `error.data.data.code`.
 *
 * @param payload - Ошибка запроса.
 * @returns Код конфликта или undefined.
 */
function extractConflictCode(payload: TRequestErrorLike): string | undefined {
    const nested = (payload.data as { data?: { code?: unknown } } | undefined)?.data?.code;
    const value = nested ?? payload.data?.code;

    return typeof value === 'string' ? value : undefined;
}

/**
 * Достаёт HTTP-статус из ошибки ofetch (statusCode самой ошибки либо тела ответа).
 *
 * @param payload - Ошибка запроса.
 * @returns Числовой статус или undefined.
 */
function extractStatusCode(payload: TRequestErrorLike): number | undefined {
    const value = payload.statusCode ?? payload.data?.statusCode;

    return typeof value === 'number' ? value : undefined;
}

/**
 * Форматирует ошибку запроса в человекочитаемое сообщение.
 *
 * @param method - HTTP-метод.
 * @param url - URL запроса.
 * @param error - Исходная ошибка.
 */
function formatRequestError(method: string, url: string, error: unknown): string {
    const payload = (error ?? {}) as TRequestErrorLike;
    const message =
        payload.data?.message ||
        payload.message ||
        (error instanceof Error ? error.message : unknownErrorMessage());
    const code = payload.data?.code || payload.code || payload.statusCode;
    const codePart = code ? ` (code: ${String(code)})` : '';

    return `${method} ${url}: ${message}${codePart}`;
}

/**
 * Приводит произвольную ошибку к RequestError с понятным текстом,
 * сохраняя HTTP-статус и код конфликта.
 *
 * @param method - HTTP-метод.
 * @param url - URL запроса.
 * @param error - Исходная ошибка.
 */
export function toRequestError(method: string, url: string, error: unknown): Error {
    // Проверка стоит первой намеренно: сообщение `FetchError` содержит URL, то
    // есть подстроку «/api/», и ранний возврат ниже пропустил бы таймаут наружу
    // с англоязычным текстом транспорта вместо честного объяснения
    if (isRequestTimeoutError(error)) {
        return new RequestError(timeoutMessage(method), undefined, undefined, error);
    }

    // Остановка запроса серверным лимитом времени — по той же причине выше
    // транспортного passthrough. Текст свой: в отличие от обрыва по потолку
    // ожидания исход здесь определён, незавершённая запись откатана
    if (isStatementTimeoutError(error)) {
        return new RequestError(
            translate(BRICKS_STATEMENT_TIMEOUT_MESSAGE_KEY),
            extractStatusCode((error ?? {}) as TRequestErrorLike),
            undefined,
            error
        );
    }

    if (error instanceof RequestError) {
        return error;
    }

    if (error instanceof Error && error.message.includes('/api/')) {
        return error;
    }

    const payload = (error ?? {}) as TRequestErrorLike;

    return new RequestError(
        formatRequestError(method, url, error),
        extractStatusCode(payload),
        extractConflictCode(payload),
        error
    );
}
