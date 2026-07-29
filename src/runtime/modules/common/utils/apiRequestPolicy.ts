/**
 * Политика запросов билдера: потолок ожидания по методу и распознавание его
 * срабатывания (BM-27). Чистые функции без Nuxt-контекста — транспорт
 * (`composables/useApiClient.ts`) только применяет их в `onRequest`.
 */

// #region Imports
// Types
import type { IApiRequestTimeoutTarget } from '../types/apiRequest';

// Utils
import { combineAbortSignals } from './abortSignals';

// Constants
import { BRICKS_API_READ_TIMEOUT_MS, BRICKS_API_WRITE_TIMEOUT_MS } from '../constants/apiTimeouts';
// #endregion

// #region Data
/**
 * Методы, которые ничего не меняют на сервере. Единственный список в политике:
 * от него зависят и потолок, и текст сообщения при обрыве — иначе две копии
 * одного знания разъехались бы молча. Незнакомый метод считается записью:
 * оптимистичная классификация опаснее осторожной.
 */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Предел обхода цепочки `cause`: ofetch кладёт исходную ошибку в `cause`
 * (`FetchError` → `TimeoutError`), но цепочка теоретически может быть
 * циклической.
 */
const MAX_ERROR_CAUSE_DEPTH = 5;
// #endregion

// #region Methods
/**
 * Читает произвольное значение как словарь без приведения к `any`: и
 * `Request`-объект, и DOMException, которым абортится `AbortSignal.timeout`,
 * нужны здесь только по нескольким полям.
 *
 * @param value - Произвольное значение.
 * @returns Словарь полей либо null для не-объектов.
 */
function readRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value !== 'object' || value === null) {
        return null;
    }

    return value as Record<string, unknown>;
}

/**
 * Меняет ли запрос состояние на сервере. Отсутствие метода — это GET
 * (`options.method` ofetch у него не заполняет), то есть чтение.
 *
 * @param method - HTTP-метод (регистр любой).
 * @returns Запрос является записью.
 */
export function isApiWriteMethod(method?: string): boolean {
    return Boolean(method) && !READ_METHODS.has(String(method).toUpperCase());
}

/**
 * Возвращает потолок ожидания для метода.
 *
 * @param method - HTTP-метод (регистр любой) либо undefined — как у GET в ofetch.
 * @returns Потолок в миллисекундах.
 */
export function resolveApiRequestTimeout(method?: string): number {
    return isApiWriteMethod(method) ? BRICKS_API_WRITE_TIMEOUT_MS : BRICKS_API_READ_TIMEOUT_MS;
}

/**
 * Определяет метод запроса. `options.method` заполнен не всегда: у GET его нет,
 * а при вызове с `Request`-объектом ofetch метод в опции не копирует — тогда
 * читаем его с самого запроса.
 *
 * @param request - Запрос (строка, URL или Request).
 * @param method - Метод из опций запроса.
 * @returns Метод в верхнем регистре либо undefined (равносильно GET).
 */
export function resolveApiRequestMethod(request: unknown, method?: string): string | undefined {
    if (method) {
        return method.toUpperCase();
    }

    const requestMethod = readRecord(request)?.method;

    return typeof requestMethod === 'string' ? requestMethod.toUpperCase() : undefined;
}

/**
 * Значение похоже на `AbortSignal`. Проверка структурная, а не `instanceof`:
 * сигнал может приехать из другого realm (worker, jsdom), где конструктор свой.
 *
 * @param value - Произвольное значение.
 * @returns Значение можно использовать как сигнал отмены.
 */
function isAbortSignalLike(value: unknown): value is AbortSignal {
    const record = readRecord(value);

    if (!record) {
        return false;
    }

    return 'aborted' in record && typeof record.addEventListener === 'function';
}

/**
 * Определяет сигнал отмены вызывающего. Как и метод, `signal` из
 * `Request`-объекта ofetch в опции не копирует, а сигнал, переданный в опциях,
 * по правилам fetch перекрывает сигнал самого запроса — без этого fallback'а
 * отмена вызывающего переставала бы работать до истечения потолка.
 *
 * Явный `options.signal` приоритетнее (в том числе `null` — это осознанный
 * отказ от сигнала).
 *
 * @param request - Запрос (строка, URL или Request).
 * @param signal - Сигнал из опций запроса.
 * @returns Сигнал вызывающего либо undefined/null.
 */
function resolveApiRequestSignal(
    request: unknown,
    signal?: AbortSignal | null
): AbortSignal | null | undefined {
    if (signal !== undefined) {
        return signal;
    }

    const requestSignal = readRecord(request)?.signal;

    return isAbortSignalLike(requestSignal) ? requestSignal : undefined;
}

/**
 * Применяет политику к опциям запроса: подставляет потолок, если вызывающий его
 * не задал, и не даёт потолку исчезнуть при переданном сигнале отмены.
 *
 * ofetch строит внутренний abort по `timeout` только когда `signal` не передан
 * (1.5.1, `shared/ofetch.*.mjs:261`), поэтому при чужом сигнале потолок
 * обеспечивается явной комбинацией. `timeout: 0` политика опт-аутом не считает:
 * это тихий возврат исходного дефекта, потолок всё равно будет поставлен.
 *
 * @param request - Запрос (строка, URL или Request).
 * @param options - Опции запроса; мутируются на месте, как принято в `onRequest`.
 */
export function applyApiRequestTimeout(request: unknown, options: IApiRequestTimeoutTarget): void {
    const timeoutMs =
        typeof options.timeout === 'number' && options.timeout > 0
            ? options.timeout
            : resolveApiRequestTimeout(resolveApiRequestMethod(request, options.method));

    options.timeout = timeoutMs;

    const callerSignal = resolveApiRequestSignal(request, options.signal);

    if (callerSignal) {
        options.signal = combineAbortSignals([callerSignal, AbortSignal.timeout(timeoutMs)]);
    }
}

/**
 * Распознаёт срабатывание потолка ожидания. Оба пути дают одно имя ошибки:
 * внутренний abort ofetch ставит `name = 'TimeoutError'`, а `AbortSignal.timeout`
 * абортится DOMException с тем же именем — но лежит она в `cause` обёртки
 * `FetchError`, поэтому цепочка обходится целиком.
 *
 * @param error - Ошибка запроса.
 * @returns Запрос оборван по таймауту.
 */
export function isRequestTimeoutError(error: unknown): boolean {
    let current: unknown = error;

    for (let depth = 0; depth < MAX_ERROR_CAUSE_DEPTH; depth += 1) {
        const errorLike = readRecord(current);

        if (!errorLike) {
            return false;
        }

        if (errorLike.name === 'TimeoutError') {
            return true;
        }

        current = errorLike.cause;
    }

    return false;
}
// #endregion
