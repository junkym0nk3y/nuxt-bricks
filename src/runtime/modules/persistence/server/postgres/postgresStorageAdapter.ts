/**
 * Дефолтный IStorageAdapter поверх PostgreSQL (таблицы bricks_pages / bricks_media).
 * Схема таблиц — database/init.sql в корне репозитория.
 */
import { query, queryOne } from './client';
import {
    PAGE_SELECT_FIELDS,
    MEDIA_SELECT_FIELDS,
    PAGE_UPDATE_FIELDS,
    MEDIA_UPDATE_FIELDS,
    buildUpdateQuery,
} from './queryBuilders';
import type {
    IStorageAdapter,
    ICreateMediaPayload,
    TUpdateMediaPayload,
} from '../../types/adapters';
import type {
    IBricksPageRow,
    ICreatePagePayload,
    IUpdatePagePayload,
    IPublishedPageSummary,
} from '../../../common/types/bricks-api';
import type { IMediaItem } from '../../../common/types/media';

/**
 * DDL-дельта bricks_pages для существующих БД — идемпотентная, зеркалит database/init.sql
 * (миграций в проекте нет, init.sql применяется только при первом старте контейнера).
 */
const PAGES_SCHEMA_DDL = `
ALTER TABLE bricks_pages ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
`;

/**
 * Создаёт Postgres-реализацию IStorageAdapter.
 *
 * @returns Адаптер хранилища страниц и медиа-метаданных.
 */
export function createPostgresStorageAdapter(): IStorageAdapter {
    // Мемоизация с reset-on-failure: сбой БД не должен «отравить» синглтон —
    // следующий запрос попробует применить DDL заново (паттерн postgresAuthAdapter).
    let schemaPromise: Promise<void> | null = null;

    /**
     * Идемпотентно гарантирует актуальность схемы bricks_pages при первом обращении.
     */
    function ensureSchema(): Promise<void> {
        if (!schemaPromise) {
            schemaPromise = query(PAGES_SCHEMA_DDL).then(
                () => undefined,
                (error: unknown) => {
                    schemaPromise = null;
                    throw error;
                }
            );
        }

        return schemaPromise;
    }

    return {
        /**
         * Возвращает все страницы, отсортированные по дате обновления.
         */
        async listPages(): Promise<IBricksPageRow[]> {
            await ensureSchema();

            return query<IBricksPageRow>(
                `SELECT ${PAGE_SELECT_FIELDS} FROM bricks_pages ORDER BY updated_at DESC`
            );
        },

        /**
         * Возвращает сводку опубликованных страниц (для роутинга published-страниц).
         */
        async listPublishedPages(): Promise<IPublishedPageSummary[]> {
            return query<IPublishedPageSummary>(
                `SELECT id, pagename, published, url_prefix as "urlPrefix", subdomain
                FROM bricks_pages
                WHERE published = true
                ORDER BY updated_at DESC`
            );
        },

        /**
         * Возвращает страницу по id или null.
         */
        async getPage(id: number): Promise<IBricksPageRow | null> {
            await ensureSchema();

            return queryOne<IBricksPageRow>(
                `SELECT ${PAGE_SELECT_FIELDS} FROM bricks_pages WHERE id = $1`,
                [id]
            );
        },

        /**
         * Возвращает страницу по pagename или null.
         */
        async getPageByPagename(pagename: string): Promise<IBricksPageRow | null> {
            await ensureSchema();

            return queryOne<IBricksPageRow>(
                `SELECT ${PAGE_SELECT_FIELDS} FROM bricks_pages WHERE pagename = $1`,
                [pagename]
            );
        },

        /**
         * Создаёт страницу и возвращает её полностью.
         */
        async createPage(payload: ICreatePagePayload): Promise<IBricksPageRow> {
            await ensureSchema();

            const result = await queryOne<IBricksPageRow>(
                `INSERT INTO bricks_pages
                (pagename, title, description, keywords, social_image, layout,
                 background_color, url_prefix, subdomain, schema, published)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING ${PAGE_SELECT_FIELDS}`,
                [
                    payload.pagename,
                    payload.title ?? null,
                    payload.description ?? null,
                    payload.keywords ?? null,
                    payload.socialImage ?? null,
                    payload.layout ?? null,
                    payload.backgroundColor ?? null,
                    payload.urlPrefix ?? null,
                    payload.subdomain ?? null,
                    JSON.stringify(payload.schema),
                    payload.published ?? true,
                ]
            );

            if (!result) {
                throw new Error('Failed to create page');
            }

            return result;
        },

        /**
         * Обновляет переданные поля страницы; null — если страница не найдена.
         */
        async updatePage(id: number, payload: IUpdatePagePayload): Promise<IBricksPageRow | null> {
            await ensureSchema();

            const existing = await queryOne<{ id: number }>(
                'SELECT id FROM bricks_pages WHERE id = $1',
                [id]
            );

            if (!existing) {
                return null;
            }

            const { updates, values } = buildUpdateQuery(payload, PAGE_UPDATE_FIELDS);

            if (updates.length === 0) {
                throw new Error('No fields to update');
            }

            values.push(id);

            return queryOne<IBricksPageRow>(
                `UPDATE bricks_pages
                SET ${updates.join(', ')}
                WHERE id = $${values.length}
                RETURNING ${PAGE_SELECT_FIELDS}`,
                values
            );
        },

        /**
         * Удаляет страницу; false — если страница не найдена.
         */
        async deletePage(id: number): Promise<boolean> {
            const existing = await queryOne<{ id: number }>(
                'SELECT id FROM bricks_pages WHERE id = $1',
                [id]
            );

            if (!existing) {
                return false;
            }

            await query('DELETE FROM bricks_pages WHERE id = $1', [id]);
            return true;
        },

        /**
         * Возвращает все медиа-записи, новые сверху.
         */
        async listMedia(): Promise<IMediaItem[]> {
            return query<IMediaItem>(
                `SELECT ${MEDIA_SELECT_FIELDS} FROM bricks_media ORDER BY uploaded_at DESC`
            );
        },

        /**
         * Возвращает медиа-запись по URL файла или null (дедупликация импорта).
         */
        async getMediaByUrl(url: string): Promise<IMediaItem | null> {
            return queryOne<IMediaItem>(
                `SELECT ${MEDIA_SELECT_FIELDS} FROM bricks_media WHERE url = $1`,
                [url]
            );
        },

        /**
         * Создаёт медиа-запись и возвращает её с id.
         */
        async createMedia(payload: ICreateMediaPayload): Promise<IMediaItem> {
            const result = await queryOne<IMediaItem>(
                `INSERT INTO bricks_media
                (url, filename, alt, size, mime_type, category, svg_content, uploaded_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, NOW()))
                RETURNING ${MEDIA_SELECT_FIELDS}`,
                [
                    payload.url,
                    payload.filename,
                    payload.alt ?? '',
                    payload.size,
                    payload.mimeType,
                    payload.category,
                    payload.svgContent ?? null,
                    payload.uploadedAt ? new Date(payload.uploadedAt) : null,
                ]
            );

            if (!result) {
                throw new Error('Failed to create media item');
            }

            return result;
        },

        /**
         * Обновляет метаданные медиа; null — если запись не найдена.
         */
        async updateMedia(id: number, payload: TUpdateMediaPayload): Promise<IMediaItem | null> {
            const existing = await queryOne<{ id: number }>(
                'SELECT id FROM bricks_media WHERE id = $1',
                [id]
            );

            if (!existing) {
                return null;
            }

            const { updates, values } = buildUpdateQuery(payload, MEDIA_UPDATE_FIELDS);

            if (updates.length === 0) {
                throw new Error('No fields to update');
            }

            values.push(id);

            return queryOne<IMediaItem>(
                `UPDATE bricks_media
                SET ${updates.join(', ')}
                WHERE id = $${values.length}
                RETURNING ${MEDIA_SELECT_FIELDS}`,
                values
            );
        },

        /**
         * Удаляет медиа-запись; false — если запись не найдена.
         */
        async deleteMedia(id: number): Promise<boolean> {
            const existing = await queryOne<{ id: number }>(
                'SELECT id FROM bricks_media WHERE id = $1',
                [id]
            );

            if (!existing) {
                return false;
            }

            await query('DELETE FROM bricks_media WHERE id = $1', [id]);
            return true;
        },
    };
}
