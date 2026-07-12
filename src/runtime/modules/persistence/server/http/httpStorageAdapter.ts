/**
 * HTTP-реализация IStorageAdapter поверх пользовательского backend
 * (`bricks.backend.mode = 'external'`): страницы, версии и media metadata
 * живут на external-сервере, файлы (S3), sharp и browser-facing
 * `/api/bricks/**` остаются локальными.
 *
 * Контракт ручек external backend — зеркало локальной структуры
 * `/api/bricks/**` относительно `bricks.backend.url` (полный base-префикс,
 * сегмент `bricks` не зашит): см. docs/external-backend-contract.md и
 * docs/backend-connection-modes-plan-2026-07-12.md (Р2).
 *
 * Формат: даты — ISO 8601; top-level ключи ответов нормализуются
 * snake_case → camelCase (toCamelCaseShallow — вложенные объекты, включая
 * `schema`, не трогаются); 409 маппится на доменные ошибки конфликтов по
 * `data.code`; 404 — null/false по контракту IStorageAdapter.
 */
import {
    createBackendHttpClient,
    BricksBackendRequestError,
    type IBackendHttpClient,
} from './httpClient';
import { toCamelCaseShallow } from '../../../common/utils/case-transform';
import { PAGE_CONFLICT_CODES } from '../../../common/constants/publish';
import { BricksPagenameConflictError, BricksRevisionConflictError } from '../utils/storageErrors';
import type {
    IStorageAdapter,
    ICreateMediaPayload,
    TUpdateMediaPayload,
} from '../../types/adapters';
import type {
    IBricksPageRow,
    TBricksPageSummaryRow,
    ICreatePagePayload,
    IUpdatePagePayload,
    IPageVersionSummary,
    IPageVersion,
} from '../../../common/types/bricks-api';
import type { IMediaItem } from '../../../common/types/media';

// #region Types
export interface IHttpStorageAdapterOptions {
    /** Полный base-префикс bricks-API external backend (bricks.backend.url). */
    baseUrl: string;
    /** Bearer-токен server-to-server запросов (NUXT_BRICKS_BACKEND_TOKEN). */
    token?: string;
    /** Readiness-эндпоинт external backend (NUXT_BRICKS_BACKEND_HEALTH_URL). */
    healthUrl?: string;
    /** Таймаут одного запроса в миллисекундах (дефолт — httpClient). */
    timeoutMs?: number;
}
// #endregion

// #region Helpers
/**
 * Нормализует строку-ответ external backend: top-level ключи snake_case →
 * camelCase, вложенные значения (включая `schema`) — без изменений.
 *
 * @param raw - Распарсенное тело ответа.
 * @param context - Описание запроса для сообщения об ошибке формата.
 * @returns Нормализованная строка.
 */
function normalizeRow<T>(raw: unknown, context: string): T {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(`[Bricks Backend] ${context}: expected an object row in response`);
    }

    return toCamelCaseShallow<T>(raw);
}

/**
 * Нормализует массив строк-ответов external backend.
 *
 * @param raw - Распарсенное тело ответа.
 * @param context - Описание запроса для сообщения об ошибке формата.
 * @returns Массив нормализованных строк.
 */
function normalizeRows<T>(raw: unknown, context: string): T[] {
    if (!Array.isArray(raw)) {
        throw new Error(`[Bricks Backend] ${context}: expected an array in response`);
    }

    return raw.map((item) => normalizeRow<T>(item, context));
}

/**
 * Достаёт список медиа из ответа: плоский массив либо envelope
 * `{ items: [...] }` (формат локального GET /api/bricks/media).
 *
 * @param raw - Распарсенное тело ответа.
 * @returns Массив сырых записей медиа.
 */
function unwrapMediaList(raw: unknown): unknown[] {
    if (Array.isArray(raw)) {
        return raw;
    }

    if (raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items)) {
        return (raw as { items: unknown[] }).items;
    }

    throw new Error('[Bricks Backend] GET media: expected an array or { items: [...] } envelope');
}

/**
 * Проверяет, что ошибка — HTTP 404 external backend (контрактный «не найдено»).
 *
 * @param error - Пойманная ошибка запроса.
 * @returns true для 404.
 */
function isNotFoundError(error: unknown): boolean {
    return error instanceof BricksBackendRequestError && error.upstreamStatus === 404;
}

/**
 * Проверяет, что ошибка — HTTP 409 external backend (конфликт записи).
 *
 * @param error - Пойманная ошибка запроса.
 * @returns true для 409.
 */
function isConflictError(error: unknown): error is BricksBackendRequestError {
    return error instanceof BricksBackendRequestError && error.upstreamStatus === 409;
}
// #endregion

/**
 * Создаёт HTTP-реализацию IStorageAdapter поверх external backend.
 *
 * @param options - baseUrl/token/healthUrl/timeout (registry берёт их из runtimeConfig).
 * @returns Адаптер хранилища страниц и медиа-метаданных.
 */
export function createHttpStorageAdapter(options: IHttpStorageAdapterOptions): IStorageAdapter {
    const client: IBackendHttpClient = createBackendHttpClient({
        baseUrl: options.baseUrl,
        token: options.token,
        timeoutMs: options.timeoutMs,
    });

    /**
     * Список медиа external backend — общий примитив list+find lookup'ов.
     */
    async function fetchMediaList(): Promise<IMediaItem[]> {
        const raw = await client.request('GET', 'media');

        return normalizeRows<IMediaItem>(unwrapMediaList(raw), 'GET media');
    }

    return {
        /**
         * Readiness-проверка: GET по сконфигурированному health URL, без него —
         * дешёвая проба `GET {base}` (контрактный listPages). Готовность — 2xx.
         */
        async checkHealth(): Promise<void> {
            await client.probeHealth(options.healthUrl || undefined);
        },

        /**
         * Сводки всех страниц без `schema` (`GET {base}`).
         */
        async listPages(): Promise<TBricksPageSummaryRow[]> {
            const raw = await client.request('GET', '');

            return normalizeRows<TBricksPageSummaryRow>(raw, 'GET pages');
        },

        /**
         * Полная строка страницы по id (`GET {base}/:id`); 404 → null.
         */
        async getPage(id: number): Promise<IBricksPageRow | null> {
            try {
                const raw = await client.request('GET', String(id));

                return normalizeRow<IBricksPageRow>(raw, `GET page ${id}`);
            } catch (error: unknown) {
                if (isNotFoundError(error)) {
                    return null;
                }

                throw error;
            }
        },

        /**
         * Страница по pagename через public-ручку контракта
         * (`GET {base}/public/pages/:pagename`) — SSR-горячий путь каждого
         * визита published-страницы; list+find здесь означал бы O(N страниц)
         * HTTP-вызова на визит. 404 (draft или нет страницы) → null.
         *
         * ВНИМАНИЕ: public projection не содержит `thumbnailUrl` и `revision` —
         * зазор закрывается синтезом (`thumbnailUrl: null`, `revision: 0`,
         * `published: true`). Единственный вызывающий (public/pages/:pagename)
         * сразу применяет toPublicPageProjection, которая эти поля отбрасывает.
         * Будущим editorial-вызывающим на синтезированные поля опираться НЕЛЬЗЯ —
         * для editorial-чтения использовать getPage(id).
         */
        async getPageByPagename(pagename: string): Promise<IBricksPageRow | null> {
            try {
                const raw = await client.request(
                    'GET',
                    `public/pages/${encodeURIComponent(pagename)}`
                );
                const row = normalizeRow<Partial<IBricksPageRow>>(
                    raw,
                    `GET public page ${pagename}`
                );

                return {
                    ...row,
                    thumbnailUrl: row.thumbnailUrl ?? null,
                    revision: row.revision ?? 0,
                    published: row.published ?? true,
                } as IBricksPageRow;
            } catch (error: unknown) {
                if (isNotFoundError(error)) {
                    return null;
                }

                throw error;
            }
        },

        /**
         * Создаёт страницу (`POST {base}`). На доменную ошибку маппится только
         * точный контрактный код: 409 `PAGENAME_CONFLICT` →
         * BricksPagenameConflictError. 409 без кода или с незнакомым кодом —
         * generic error (иначе любой посторонний конфликт backend'а — квота,
         * состояние — заставил бы UI предлагать переименование).
         */
        async createPage(payload: ICreatePagePayload): Promise<IBricksPageRow> {
            try {
                const raw = await client.request('POST', '', payload);

                return normalizeRow<IBricksPageRow>(raw, 'POST page');
            } catch (error: unknown) {
                if (isConflictError(error) && error.conflictCode === PAGE_CONFLICT_CODES.pagename) {
                    throw new BricksPagenameConflictError(payload.pagename);
                }

                throw error;
            }
        },

        /**
         * Частично обновляет страницу (`PATCH {base}/:id`, только PATCH —
         * partial-семантика IUpdatePagePayload; `expectedRevision` уходит
         * precondition-полем тела). 404 → null. На доменные ошибки маппятся
         * только точные контрактные коды 409: `PAGENAME_CONFLICT` →
         * BricksPagenameConflictError, `REVISION_CONFLICT` →
         * BricksRevisionConflictError; 409 без кода/с незнакомым кодом —
         * generic error (посторонний конфликт backend'а не должен заставлять
         * UI предлагать rename или refetch-and-retry).
         *
         * Инвариант версионирования (снапшот при изменении `schema` + prune до
         * лимита) — обязанность external-сервера (контракт IStorageAdapter.updatePage).
         */
        async updatePage(id: number, payload: IUpdatePagePayload): Promise<IBricksPageRow | null> {
            try {
                const raw = await client.request('PATCH', String(id), payload);

                return normalizeRow<IBricksPageRow>(raw, `PATCH page ${id}`);
            } catch (error: unknown) {
                if (isNotFoundError(error)) {
                    return null;
                }

                if (isConflictError(error)) {
                    if (error.conflictCode === PAGE_CONFLICT_CODES.pagename) {
                        throw new BricksPagenameConflictError(payload.pagename ?? '');
                    }

                    if (error.conflictCode === PAGE_CONFLICT_CODES.revision) {
                        throw new BricksRevisionConflictError(id);
                    }
                }

                throw error;
            }
        },

        /**
         * Удаляет страницу (`DELETE {base}/:id`); 404 → false.
         */
        async deletePage(id: number): Promise<boolean> {
            try {
                await client.request('DELETE', String(id));

                return true;
            } catch (error: unknown) {
                if (isNotFoundError(error)) {
                    return false;
                }

                throw error;
            }
        },

        /**
         * Сводки версий страницы (`GET {base}/:id/versions`), новые сверху.
         */
        async listPageVersions(pageId: number): Promise<IPageVersionSummary[]> {
            const raw = await client.request('GET', `${pageId}/versions`);

            return normalizeRows<IPageVersionSummary>(raw, `GET page ${pageId} versions`);
        },

        /**
         * Полный снапшот версии (`GET {base}/:id/versions/:versionId`); 404 → null.
         */
        async getPageVersion(pageId: number, versionId: number): Promise<IPageVersion | null> {
            try {
                const raw = await client.request('GET', `${pageId}/versions/${versionId}`);

                return normalizeRow<IPageVersion>(raw, `GET page ${pageId} version ${versionId}`);
            } catch (error: unknown) {
                if (isNotFoundError(error)) {
                    return null;
                }

                throw error;
            }
        },

        /**
         * Все медиа-записи (`GET {base}/media`): плоский массив либо envelope
         * `{ items }` (формат локальной ручки).
         */
        async listMedia(): Promise<IMediaItem[]> {
            return fetchMediaList();
        },

        /**
         * Медиа-запись по id — list+find (низкочастотный вызов: delete
         * orchestration, media proxy). Известное ограничение O(N) на больших
         * медиатеках; point-lookup ручка — follow-up контракта.
         */
        async getMedia(id: number): Promise<IMediaItem | null> {
            const items = await fetchMediaList();

            return items.find((item) => item.id === id) ?? null;
        },

        /**
         * Медиа-запись по URL — list+find (низкочастотный вызов: дедупликация
         * импорта из бакета).
         */
        async getMediaByUrl(url: string): Promise<IMediaItem | null> {
            const items = await fetchMediaList();

            return items.find((item) => item.url === url) ?? null;
        },

        /**
         * Регистрирует метаданные медиа (`POST {base}/media` —
         * server-to-server-only ручка контракта, binary не передаётся).
         * Идемпотентность по `url` — обязанность external-сервера; 409 от
         * backend'а дополнительно разруливается повторным чтением по url
         * (гонка импорта/ретрай), как в Postgres-адаптере.
         */
        async createMedia(payload: ICreateMediaPayload): Promise<IMediaItem> {
            try {
                const raw = await client.request('POST', 'media', payload);

                return normalizeRow<IMediaItem>(raw, 'POST media');
            } catch (error: unknown) {
                if (!isConflictError(error)) {
                    throw error;
                }

                const existing = await fetchMediaList().then(
                    (items) => items.find((item) => item.url === payload.url) ?? null
                );

                if (!existing) {
                    throw error;
                }

                return existing;
            }
        },

        /**
         * Обновляет метаданные медиа (`PATCH {base}/media/:id`); 404 → null.
         */
        async updateMedia(id: number, payload: TUpdateMediaPayload): Promise<IMediaItem | null> {
            try {
                const raw = await client.request('PATCH', `media/${id}`, payload);

                return normalizeRow<IMediaItem>(raw, `PATCH media ${id}`);
            } catch (error: unknown) {
                if (isNotFoundError(error)) {
                    return null;
                }

                throw error;
            }
        },

        /**
         * Удаляет медиа-запись (`DELETE {base}/media/:id`); 404 → false.
         * File-first порядок удаления файла обеспечивает локальный handler
         * (mediaOrchestration.deleteMediaWithFile) — external получает только
         * удаление метаданных.
         */
        async deleteMedia(id: number): Promise<boolean> {
            try {
                await client.request('DELETE', `media/${id}`);

                return true;
            } catch (error: unknown) {
                if (isNotFoundError(error)) {
                    return false;
                }

                throw error;
            }
        },
    };
}
