/**
 * Политика запросов: потолок ожидания по методу и распознавание его
 * срабатывания. Чистые функции без Nuxt-контекста — применяют их в `onRequest`
 * все три транспорта проекта: клиент билдера (`composables/useApiClient.ts`) и
 * публичные клиенты рендера (lookup страницы, data sources).
 *
 * Политика рассчитана на клиентов без повторов (`retry: 0` у всех трёх). При
 * включённых повторах ofetch зовёт запрос заново с теми же опциями, где уже
 * стоит наш сработавший сигнал, — вторая попытка упала бы мгновенно, не дойдя до
 * сети. Повторы вводить придётся вместе с решением, чей это бюджет: попытки или
 * всего логического запроса.
 */

// #region Imports
// Types
import type { IApiRequestTimeoutTarget } from '../types/apiRequest';

// Utils
import { combineAbortSignals, createTimeoutSignal } from './abortSignals';

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
 * Ключи локали для обрыва по потолку ожидания. Чтение и запись различаются по
 * существу, а не по формулировке: оборванное чтение можно просто повторить, а
 * оборванная запись могла быть применена сервером.
 *
 * Ключи живут здесь же, где список методов: иначе два домена выбирали бы текст
 * по своей копии правила, и копии разъехались бы молча.
 */
const TIMEOUT_MESSAGE_KEYS = {
    read: 'bricks.common.readTimeout',
    write: 'bricks.common.writeTimeout',
} as const;

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
 * Возвращает ключ локали для обрыва запроса по потолку ожидания. Перевод
 * остаётся за вызывающим: у стора, утилиты и компонента свой доступ к i18n.
 *
 * @param method - HTTP-метод оборванного запроса (регистр любой).
 * @returns Ключ локали сообщения.
 */
export function resolveRequestTimeoutMessageKey(method?: string): string {
    return isApiWriteMethod(method) ? TIMEOUT_MESSAGE_KEYS.write : TIMEOUT_MESSAGE_KEYS.read;
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
 * Явный `options.signal` приоритетнее; `null` означает отказ наследовать сигнал
 * с `Request`-объекта, а не отказ от потолка — потолок политика ставит отдельно
 * и в любом случае.
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
 * Применяет политику к опциям запроса: выбирает потолок и ставит его сигналом.
 *
 * Сигнал ставится ВСЕГДА, а не только поверх чужого. Опция `timeout` ofetch
 * покрывает лишь ожидание заголовков: её таймер снимается в `finally` вокруг
 * одного `await fetch(...)`, а тело читается позже (1.5.1,
 * `shared/ofetch.*.mjs:287-300`) — сервер, отдавший статус и зависший посреди
 * JSON, держал бы промис вечно вместе с `isSubmitting` и недостижимым `finally`.
 * Живой сигнал обрывает обе фазы. Внутренний механизм ofetch при этом не
 * включается вовсе: он строится только при отсутствии `signal` (`:261`).
 *
 * `options.timeout` остаётся заполненным как эффективное значение политики —
 * читаемая декларация бюджета в опциях; фактическую границу держит сигнал.
 *
 * Опт-аутом политика не считает ни `timeout: 0`, ни нечисловое значение, ни
 * `signal: null` — каждое из них было бы тихим возвратом исходного дефекта.
 *
 * @param request - Запрос (строка, URL или Request).
 * @param options - Опции запроса; мутируются на месте.
 * @returns Сигнал, легший в опции: по его `reason` вызывающий отличает
 * сработавший потолок от отмены (см. `normalizeRequestAbortError`).
 */
export function applyApiRequestTimeout(
    request: unknown,
    options: IApiRequestTimeoutTarget
): AbortSignal {
    // Значение с вызова уважается, но только интерпретируемое: `Infinity` или
    // `NaN` в override'е — не «ждать дольше», а потерянный потолок
    const timeoutMs =
        typeof options.timeout === 'number' &&
        Number.isFinite(options.timeout) &&
        options.timeout > 0
            ? options.timeout
            : resolveApiRequestTimeout(resolveApiRequestMethod(request, options.method));

    options.timeout = timeoutMs;

    const callerSignal = resolveApiRequestSignal(request, options.signal);
    const timeoutSignal = createTimeoutSignal(timeoutMs);
    const effectiveSignal = callerSignal
        ? combineAbortSignals([callerSignal, timeoutSignal])
        : timeoutSignal;

    options.signal = effectiveSignal;

    return effectiveSignal;
}

/**
 * Распознаёт срабатывание потолка ожидания по имени `TimeoutError` в цепочке
 * `cause`: обрыв на фазе заголовков ofetch оборачивает в `FetchError`, а обрыв на
 * фазе чтения тела летит наружу как есть — чтение тела в ofetch не обёрнуто
 * try/catch. Поэтому цепочка обходится целиком, а не проверяется одним уровнем.
 *
 * Ошибку с фазы тела в браузере предикат сам по себе не распознает — там имя
 * подменено платформой; её приводит к распознаваемому виду
 * `normalizeRequestAbortError` на выходе транспорта.
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

/**
 * Ошибка — обрыв запроса (`AbortError` где-либо в цепочке `cause`).
 *
 * @param error - Ошибка запроса.
 * @returns Запрос оборван.
 */
function isRequestAbortError(error: unknown): boolean {
    let current: unknown = error;

    for (let depth = 0; depth < MAX_ERROR_CAUSE_DEPTH; depth += 1) {
        const errorLike = readRecord(current);

        if (!errorLike) {
            return false;
        }

        if (errorLike.name === 'AbortError') {
            return true;
        }

        current = errorLike.cause;
    }

    return false;
}

/**
 * Приводит обрыв по потолку к распознаваемому виду, когда платформа потеряла
 * причину аборта.
 *
 * Установлено замером: причину сохраняет не всякая платформа и не на всякой фазе.
 * Node (undici) отдаёт `reason` сигнала и на заголовках, и на чтении тела, а
 * Chrome — только на заголовках: при аборте во время чтения тела он подменяет
 * ошибку на `AbortError` («The user aborted a request») независимо от того, чем
 * абортировали, так что собственный `TimeoutError` в `reason` теряется так же,
 * как нативный. Без этой нормализации зависшее тело выглядело бы как отмена
 * пользователя: запись не получила бы честного текста неизвестного исхода, а
 * список страниц — сверки, хотя именно зависание на теле чаще всего и означает,
 * что сервер запись уже применил.
 *
 * Судим не по ошибке, а по сигналу: `reason` комбинированного сигнала хранит
 * причину ПЕРВОГО аборта, поэтому отмена вызывающего остаётся отменой. Считать
 * таймаутом любой `AbortError` было бы нельзя — уход пользователя со страницы и
 * общий дедлайн прогона data sources стали бы таймаутами.
 *
 * @param error - Ошибка запроса.
 * @param effectiveSignal - Сигнал, поставленный `applyApiRequestTimeout`.
 * @returns Исходная ошибка либо `TimeoutError` с ней в `cause`.
 */
export function normalizeRequestAbortError(error: unknown, effectiveSignal: AbortSignal): unknown {
    if (isRequestTimeoutError(error) || !isRequestAbortError(error)) {
        return error;
    }

    if (!effectiveSignal.aborted || !isRequestTimeoutError(effectiveSignal.reason)) {
        return error;
    }

    const timeoutError = new Error('The request was aborted after reaching the timeout', {
        cause: error,
    });
    timeoutError.name = 'TimeoutError';

    return timeoutError;
}
// #endregion
