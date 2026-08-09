/**
 * HTTP-реализация IStorageAdapter поверх пользовательского backend
 * (`bricks.backend.mode = 'external'`): страницы, версии и media metadata
 * живут на external-сервере, файлы (S3), sharp и browser-facing
 * `/api/bricks/**` остаются локальными.
 *
 * Контракт ручек external backend — зеркало локальной структуры
 * `/api/bricks/**` относительно `bricks.backend.url` (полный base-префикс,
 * сегмент `bricks` не зашит): см. docs/external-backend-contract.md.
 *
 * Формат: даты — ISO 8601; top-level ключи ответов нормализуются
 * snake_case → camelCase (toCamelCaseShallow — вложенные объекты, включая
 * `schema`, не трогаются); 409 маппится на доменные ошибки конфликтов по
 * `data.code`; 404 — null/false по контракту IStorageAdapter.
 */
import { createBackendHttpClient, type IBackendHttpClient } from './httpClient';
import {
    isConflictError,
    isNotFoundError,
    normalizeRow,
    normalizeRows,
} from './httpAdapterHelpers';
import { createHttpMediaMethods } from './httpMediaMethods';
import { getPageAddressKey } from '../../../common/utils/bricks/pageAddress';
import type { IBricksPageAddress } from '../../../common/types/pageAddress';
import { PAGE_CONFLICT_CODES } from '../../../common/constants/publish';
import {
    BricksPageAddressConflictError,
    BricksRevisionConflictError,
} from '../utils/storageErrors';
import type { IStorageAdapter } from '../../types/adapters';
import type {
    IBricksPageRow,
    TBricksPageSummaryRow,
    ICreatePagePayload,
    IUpdatePagePayload,
    IPageVersionSummary,
    IPageVersion,
} from '../../../common/types/bricks-api';

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
         * Страница по адресу через public-ручку контракта
         * (`GET {base}/public/pages/<urlPrefix>/<pagename>`) — SSR-горячий путь
         * каждого визита published-страницы; list+find здесь означал бы O(N
         * страниц) HTTP-вызова на визит. 404 (draft или нет страницы) → null.
         *
         * Адрес уезжает путём, а не query-параметром: он и есть идентичность
         * ресурса, и путь одинаково переживает нормализацию прокси и кеширование
         * CDN. Каждый сегмент кодируется отдельно — `encodeURIComponent` от
         * склеенного адреса превратил бы разделитель `/` в `%2F`, и backend
         * получил бы один сегмент вместо префикса с именем.
         *
         * ВНИМАНИЕ: public projection не содержит `thumbnailUrl` и `revision` —
         * зазор закрывается синтезом (`thumbnailUrl: null`, `revision: 0`,
         * `published: true`). Единственный вызывающий (public-ручка адреса)
         * сразу применяет toPublicPageProjection, которая эти поля отбрасывает.
         * Будущим editorial-вызывающим на синтезированные поля опираться НЕЛЬЗЯ —
         * для editorial-чтения использовать getPage(id).
         */
        async getPageByAddress(address: IBricksPageAddress): Promise<IBricksPageRow | null> {
            const addressKey = getPageAddressKey(address);

            try {
                const encodedAddress = addressKey
                    .split('/')
                    .map((segment) => encodeURIComponent(segment))
                    .join('/');
                const raw = await client.request('GET', `public/pages/${encodedAddress}`);
                const row = normalizeRow<Partial<IBricksPageRow>>(
                    raw,
                    `GET public page ${addressKey}`
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
         * BricksPageAddressConflictError. 409 без кода или с незнакомым кодом —
         * generic error (иначе любой посторонний конфликт backend'а — квота,
         * состояние — заставил бы UI предлагать переименование).
         */
        async createPage(payload: ICreatePagePayload): Promise<IBricksPageRow> {
            try {
                const raw = await client.request('POST', '', payload);

                return normalizeRow<IBricksPageRow>(raw, 'POST page');
            } catch (error: unknown) {
                if (isConflictError(error) && error.errorCode === PAGE_CONFLICT_CODES.pagename) {
                    throw new BricksPageAddressConflictError();
                }

                throw error;
            }
        },

        /**
         * Частично обновляет страницу (`PATCH {base}/:id`, только PATCH —
         * partial-семантика IUpdatePagePayload; `expectedRevision` уходит
         * precondition-полем тела). 404 → null. На доменные ошибки маппятся
         * только точные контрактные коды 409: `PAGENAME_CONFLICT` →
         * BricksPageAddressConflictError, `REVISION_CONFLICT` →
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
                    if (error.errorCode === PAGE_CONFLICT_CODES.pagename) {
                        throw new BricksPageAddressConflictError();
                    }

                    if (error.errorCode === PAGE_CONFLICT_CODES.revision) {
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

        ...createHttpMediaMethods(client),
    };
}
