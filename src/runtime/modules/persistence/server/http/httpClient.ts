/**
 * HTTP-клиент external data backend (`bricks.backend.mode = 'external'`).
 *
 * Server-to-server транспорт HttpStorageAdapter'а: строит заголовки с нуля
 * (browser identity — cookie `bricks-session`, Basic-креды — НЕ пробрасывается),
 * добавляет `Authorization: Bearer <токен>` при заданном NUXT_BRICKS_BACKEND_TOKEN,
 * ограничивает каждый запрос таймаутом через AbortSignal и не следует
 * редиректам (redirect: 'error' — смена метода/хоста втихую недопустима).
 *
 * Ошибки ответа нормализуются в BricksBackendRequestError со статусом и
 * лояльно распарсенным кодом конфликта (`data.code` формата локального
 * toPageHttpError, fallback — top-level `code`); маппинг на доменные ошибки —
 * обязанность адаптера (httpStorageAdapter.ts).
 */
import { joinURL } from 'ufo';

// #region Types
export interface IBackendHttpClientOptions {
    /** Полный base-префикс bricks-API external backend (bricks.backend.url). */
    baseUrl: string;
    /** Bearer-токен server-to-server запросов (NUXT_BRICKS_BACKEND_TOKEN). */
    token?: string;
    /** Таймаут одного запроса в миллисекундах. */
    timeoutMs?: number;
}

type TBackendHttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface IBackendHttpClient {
    /**
     * Выполняет JSON-запрос по пути относительно baseUrl и возвращает
     * распарсенное тело (null — для пустого ответа/204).
     */
    request(method: TBackendHttpMethod, path: string, body?: unknown): Promise<unknown>;
    /** GET-проба готовности: reject — если ответ не 2xx или запрос не удался. */
    probeHealth(healthUrl?: string): Promise<void>;
}
// #endregion

// #region Constants
/** Дефолтный таймаут запроса к external backend (конвенция модуля — 10 с). */
const DEFAULT_BACKEND_TIMEOUT_MS = 10_000;
// #endregion

/**
 * Ошибка ответа external backend: HTTP-статус upstream + машиночитаемый код
 * конфликта из тела (`data.code` ?? `code`), если backend его прислал.
 *
 * Поле статуса намеренно называется `upstreamStatus`, а НЕ `statusCode`:
 * toHttpError (handlerHelpers) перебрасывает объекты со `statusCode` как
 * готовые H3-ошибки — upstream-статусы (401 неверного Bearer, 5xx backend'а)
 * стали бы browser-facing и обошли generic 500-envelope с errorId. Наружу
 * попадают только контрактные значения, которые адаптер явно маппит:
 * 404 → null/false, 409 → доменные ошибки конфликтов.
 */
export class BricksBackendRequestError extends Error {
    readonly upstreamStatus: number;
    readonly conflictCode: string | null;

    constructor(upstreamStatus: number, conflictCode: string | null, message: string) {
        super(message);
        this.name = 'BricksBackendRequestError';
        this.upstreamStatus = upstreamStatus;
        this.conflictCode = conflictCode;
    }
}

// #region Helpers
/**
 * Лояльно достаёт код конфликта из тела ошибки: формат локального
 * toPageHttpError (`data.code`) с fallback'ом на top-level `code`.
 *
 * @param body - Распарсенное JSON-тело ошибки (может быть любым).
 * @returns Строковый код или null.
 */
function extractConflictCode(body: unknown): string | null {
    if (!body || typeof body !== 'object') {
        return null;
    }

    const data = (body as { data?: unknown }).data;

    if (data && typeof data === 'object') {
        const nestedCode = (data as { code?: unknown }).code;

        if (typeof nestedCode === 'string') {
            return nestedCode;
        }
    }

    const topLevelCode = (body as { code?: unknown }).code;

    return typeof topLevelCode === 'string' ? topLevelCode : null;
}

/**
 * Читает тело ответа как JSON best-effort (не-JSON/пустое тело → null).
 *
 * @param response - Ответ fetch.
 * @returns Распарсенное тело или null.
 */
async function parseJsonSafely(response: Response): Promise<unknown> {
    try {
        const text = await response.text();

        return text ? JSON.parse(text) : null;
    } catch {
        return null;
    }
}
// #endregion

/**
 * Создаёт HTTP-клиент external data backend.
 *
 * @param options - baseUrl/token/timeout из runtimeConfig (см. registry.ts).
 * @returns Транспорт для HttpStorageAdapter.
 */
export function createBackendHttpClient(options: IBackendHttpClientOptions): IBackendHttpClient {
    const timeoutMs = options.timeoutMs ?? DEFAULT_BACKEND_TIMEOUT_MS;

    /**
     * Проверяет, что base URL сконфигурирован, и возвращает его.
     */
    function requireBaseUrl(): string {
        if (!options.baseUrl) {
            throw new Error(
                '[Bricks Backend] backend.url is not configured. ' +
                    'Set bricks.backend.url in nuxt.config or NUXT_BRICKS_BACKEND_URL ' +
                    'before the server starts (bricks.backend.mode = "external").'
            );
        }

        return options.baseUrl;
    }

    /**
     * Собирает заголовки запроса с нуля: browser identity не пробрасывается.
     */
    function buildHeaders(hasBody: boolean): Record<string, string> {
        const headers: Record<string, string> = { accept: 'application/json' };

        if (options.token) {
            headers.authorization = `Bearer ${options.token}`;
        }

        if (hasBody) {
            headers['content-type'] = 'application/json';
        }

        return headers;
    }

    /**
     * Выполняет fetch с таймаутом и контекстной ошибкой сетевого сбоя.
     */
    async function fetchWithTimeout(
        url: string,
        method: TBackendHttpMethod,
        body: unknown
    ): Promise<Response> {
        try {
            return await fetch(url, {
                method,
                headers: buildHeaders(body !== undefined),
                body: body !== undefined ? JSON.stringify(body) : undefined,
                redirect: 'error',
                signal: AbortSignal.timeout(timeoutMs),
            });
        } catch (error: unknown) {
            const reason = error instanceof Error ? error.message : String(error);

            throw new Error(
                `[Bricks Backend] ${method} ${url} failed: ${reason} (timeout ${timeoutMs}ms)`,
                { cause: error }
            );
        }
    }

    return {
        /**
         * JSON-запрос по пути относительно baseUrl. Ответ external backend'а —
         * доверенный операторский источник (тот же уровень, что собственная БД):
         * тело парсится обычным JSON.parse, а top-level ключи нормализует
         * адаптер (toCamelCaseShallow — прототип не наследуется).
         */
        async request(method: TBackendHttpMethod, path: string, body?: unknown): Promise<unknown> {
            const url = joinURL(requireBaseUrl(), path);
            const response = await fetchWithTimeout(url, method, body);

            if (!response.ok) {
                const errorBody = await parseJsonSafely(response);

                throw new BricksBackendRequestError(
                    response.status,
                    extractConflictCode(errorBody),
                    `[Bricks Backend] ${method} ${url} responded HTTP ${response.status}`
                );
            }

            if (response.status === 204) {
                return null;
            }

            const text = await response.text();

            if (!text) {
                return null;
            }

            try {
                return JSON.parse(text) as unknown;
            } catch (error: unknown) {
                throw new Error(`[Bricks Backend] ${method} ${url} responded with invalid JSON`, {
                    cause: error,
                });
            }
        },

        /**
         * GET-проба готовности: сконфигурированный health URL либо base URL
         * контракта (`GET {base}` — listPages). Готовность — только 2xx.
         */
        async probeHealth(healthUrl?: string): Promise<void> {
            const url = healthUrl || joinURL(requireBaseUrl(), '');
            const response = await fetchWithTimeout(url, 'GET', undefined);
            // Тело пробы не используется — освобождаем поток
            await response.body?.cancel().catch(() => undefined);

            if (!response.ok) {
                throw new BricksBackendRequestError(
                    response.status,
                    null,
                    `[Bricks Backend] health probe ${url} responded HTTP ${response.status}`
                );
            }
        },
    };
}
