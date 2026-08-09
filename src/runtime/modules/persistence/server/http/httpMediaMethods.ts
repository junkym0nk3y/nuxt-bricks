/**
 * Медиа-часть HTTP-адаптера external backend: записи медиа и категории.
 *
 * Отдельным файлом от `httpStorageAdapter.ts` по шву домена — страницы и медиа не
 * пересекаются ни одним запросом, а вместе файл перерастал потолок в 500 строк.
 * Адаптер собирает контракт спредом этих методов.
 *
 * Контракт ручек — зеркало локальных `/api/bricks/media/**`:
 * см. docs/external-backend-contract.md.
 */
import type { IBackendHttpClient } from './httpClient';
import {
    isConflictError,
    isNotFoundError,
    normalizeRow,
    normalizeRows,
    unwrapItemsList,
} from './httpAdapterHelpers';
import type {
    ICreateMediaPayload,
    ICreateMediaCategoryPayload,
    TDeleteMediaCategoryResult,
    TStorageMediaMethods,
    TUpdateMediaPayload,
} from '../../types/adapters';
import type { IMediaCategory, IMediaItem } from '../../../common/types/media';

/**
 * Создаёт медиа-часть HTTP-адаптера.
 *
 * @param client - HTTP-клиент external backend.
 * @returns Медиа-методы контракта хранилища.
 */
export function createHttpMediaMethods(client: IBackendHttpClient): TStorageMediaMethods {
    /**
     * Список медиа external backend — общий примитив list+find lookup'ов.
     */
    async function fetchMediaList(): Promise<IMediaItem[]> {
        const raw = await client.request('GET', 'media');

        return normalizeRows<IMediaItem>(unwrapItemsList(raw, 'GET media'), 'GET media');
    }

    /**
     * Список категорий external backend — общий примитив листинга и разрешения
     * конфликта при создании.
     */
    async function fetchMediaCategoryList(): Promise<IMediaCategory[]> {
        const raw = await client.request('GET', 'media/categories');

        return normalizeRows<IMediaCategory>(
            unwrapItemsList(raw, 'GET media/categories'),
            'GET media/categories'
        );
    }

    return {
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

        /**
         * Категории медиатеки (`GET {base}/media/categories`): плоский массив
         * либо envelope `{ items }` — тот же разбор, что у списка медиа.
         *
         * Отказ не подменяется системным набором: галерея без категорий выглядит
         * рабочей, и «категории не сохраняются» читалось бы как дефект UI, а не
         * как нереализованная ручка контракта.
         */
        async listMediaCategories(): Promise<IMediaCategory[]> {
            return fetchMediaCategoryList();
        },

        /**
         * Создаёт категорию (`POST {base}/media/categories`). Идемпотентность по
         * `slug` — обязанность external-сервера (как и у createMedia); 409
         * разруливается повторным чтением списка.
         */
        async createMediaCategory(payload: ICreateMediaCategoryPayload): Promise<IMediaCategory> {
            try {
                const raw = await client.request('POST', 'media/categories', payload);

                return normalizeRow<IMediaCategory>(raw, 'POST media/categories');
            } catch (error: unknown) {
                if (!isConflictError(error)) {
                    throw error;
                }

                const existing = await fetchMediaCategoryList().then(
                    (items) => items.find((item) => item.slug === payload.slug) ?? null
                );

                if (!existing) {
                    throw error;
                }

                return existing;
            }
        },

        /**
         * Удаляет категорию, сняв её с файлов
         * (`DELETE {base}/media/categories/:slug`); 404 → null.
         *
         * Атомарность обеих половин — обязанность external-сервера: локальная
         * сторона не может обернуть чужие две записи в транзакцию, и разбивать
         * операцию на два HTTP-вызова означало бы окно, в котором категория с
         * файлов уже снята, а сама категория осталась.
         */
        async deleteMediaCategory(slug: string): Promise<TDeleteMediaCategoryResult> {
            try {
                const raw = await client.request(
                    'DELETE',
                    `media/categories/${encodeURIComponent(slug)}`
                );
                const response = normalizeRow<{ clearedCount?: unknown }>(
                    raw,
                    `DELETE media/categories ${slug}`
                );
                const clearedCount = Number(response.clearedCount);

                return {
                    clearedCount: Number.isFinite(clearedCount) ? clearedCount : 0,
                };
            } catch (error: unknown) {
                if (isNotFoundError(error)) {
                    return null;
                }

                throw error;
            }
        },
    };
}
