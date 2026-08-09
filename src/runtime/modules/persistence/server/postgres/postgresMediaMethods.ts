/**
 * Медиа-часть Postgres-адаптера: записи `bricks_media` и категории
 * `bricks_media_categories`.
 *
 * Отдельным файлом от `postgresStorageAdapter.ts` по шву домена — страницы и
 * медиа не пересекаются ни одним запросом, а вместе файл перерастал потолок в
 * 500 строк. Адаптер собирает контракт спредом этих методов.
 */
import { query, queryOne, withTransaction } from './client';
import {
    MEDIA_SELECT_FIELDS,
    MEDIA_CATEGORY_SELECT_FIELDS,
    MEDIA_UPDATE_FIELDS,
    buildUpdateQuery,
    isUniqueViolation,
} from './queryBuilders';
import type {
    ICreateMediaPayload,
    ICreateMediaCategoryPayload,
    TDeleteMediaCategoryResult,
    TStorageMediaMethods,
    TUpdateMediaPayload,
} from '../../types/adapters';
import type { IMediaCategory, IMediaItem } from '../../../common/types/media';

/**
 * Возвращает медиа-запись по URL файла или null.
 *
 * @param url - Публичный URL файла.
 * @returns Медиа-запись или null.
 */
function findMediaByUrl(url: string): Promise<IMediaItem | null> {
    return queryOne<IMediaItem>(`SELECT ${MEDIA_SELECT_FIELDS} FROM bricks_media WHERE url = $1`, [
        url,
    ]);
}

/**
 * Создаёт медиа-часть Postgres-адаптера.
 *
 * @returns Медиа-методы контракта хранилища.
 */
export function createPostgresMediaMethods(): TStorageMediaMethods {
    return {
        /**
         * Возвращает все медиа-записи, новые сверху.
         */
        async listMedia(): Promise<IMediaItem[]> {
            return query<IMediaItem>(
                `SELECT ${MEDIA_SELECT_FIELDS} FROM bricks_media ORDER BY uploaded_at DESC`
            );
        },

        /**
         * Возвращает медиа-запись по id или null.
         */
        async getMedia(id: number): Promise<IMediaItem | null> {
            return queryOne<IMediaItem>(
                `SELECT ${MEDIA_SELECT_FIELDS} FROM bricks_media WHERE id = $1`,
                [id]
            );
        },

        /**
         * Возвращает медиа-запись по URL файла или null (дедупликация импорта).
         */
        async getMediaByUrl(url: string): Promise<IMediaItem | null> {
            return findMediaByUrl(url);
        },

        /**
         * Создаёт медиа-запись и возвращает её с id.
         * Идемпотентна по url (контракт IStorageAdapter.createMedia): при
         * unique_violation (гонка импорта/ретрай, индекс uq_bricks_media_url)
         * возвращает уже существующую запись.
         */
        async createMedia(payload: ICreateMediaPayload): Promise<IMediaItem> {
            let result: IMediaItem | null;

            try {
                result = await queryOne<IMediaItem>(
                    `INSERT INTO bricks_media
                (url, filename, alt, size, mime_type, category, svg_content,
                 width, height, preview_url, mock_url, uploaded_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, NOW()))
                RETURNING ${MEDIA_SELECT_FIELDS}`,
                    [
                        payload.url,
                        payload.filename,
                        payload.alt ?? '',
                        payload.size,
                        payload.mimeType,
                        payload.category,
                        payload.svgContent ?? null,
                        payload.width ?? null,
                        payload.height ?? null,
                        payload.previewUrl ?? null,
                        payload.mockUrl ?? null,
                        payload.uploadedAt ? new Date(payload.uploadedAt) : null,
                    ]
                );
            } catch (error: unknown) {
                if (!isUniqueViolation(error)) {
                    throw error;
                }

                result = await findMediaByUrl(payload.url);
            }

            if (!result) {
                throw new Error('Failed to create media item');
            }

            return result;
        },

        /**
         * Обновляет метаданные медиа; null — если запись не найдена.
         */
        async updateMedia(id: number, payload: TUpdateMediaPayload): Promise<IMediaItem | null> {
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
            const rows = await query<{ id: number }>(
                'DELETE FROM bricks_media WHERE id = $1 RETURNING id',
                [id]
            );

            return rows.length > 0;
        },

        /**
         * Возвращает категории медиатеки в порядке показа.
         */
        async listMediaCategories(): Promise<IMediaCategory[]> {
            return query<IMediaCategory>(
                `SELECT ${MEDIA_CATEGORY_SELECT_FIELDS}
            FROM bricks_media_categories
            ORDER BY sort_order, id`
            );
        },

        /**
         * Создаёт пользовательскую категорию; при повторе того же slug'а
         * возвращает существующую (контракт идемпотентности).
         *
         * `sort_order` считается как «после всех» с шагом 10: без этого новая
         * категория садилась бы в 0 и уезжала в начало ряда, перед заведёнными
         * раньше.
         */
        async createMediaCategory(payload: ICreateMediaCategoryPayload): Promise<IMediaCategory> {
            const created = await queryOne<IMediaCategory>(
                `INSERT INTO bricks_media_categories (slug, label, sort_order)
            VALUES (
                $1,
                $2,
                (SELECT COALESCE(MAX(sort_order), 0) + 10 FROM bricks_media_categories)
            )
            ON CONFLICT (slug) DO NOTHING
            RETURNING ${MEDIA_CATEGORY_SELECT_FIELDS}`,
                [payload.slug, payload.label]
            );

            if (created) {
                return created;
            }

            // DO NOTHING не вернул строку — категория с этим slug'ом уже есть
            const existing = await queryOne<IMediaCategory>(
                `SELECT ${MEDIA_CATEGORY_SELECT_FIELDS}
            FROM bricks_media_categories
            WHERE slug = $1`,
                [payload.slug]
            );

            if (!existing) {
                throw new Error('Failed to create media category');
            }

            return existing;
        },

        /**
         * Снимает категорию с её файлов и удаляет саму категорию одной
         * транзакцией; null — категории с таким slug нет.
         *
         * Категорию с файлов снимает явный UPDATE, хотя то же сделал бы
         * `ON DELETE SET NULL`: ответ обязан сказать, скольких файлов это
         * коснулось, а из DELETE такого числа не получить.
         */
        async deleteMediaCategory(slug: string): Promise<TDeleteMediaCategoryResult> {
            return withTransaction(async (txQuery) => {
                const existing = await txQuery<{ slug: string }>(
                    'SELECT slug FROM bricks_media_categories WHERE slug = $1 FOR UPDATE',
                    [slug]
                );

                if (existing.length === 0) {
                    return null;
                }

                const cleared = await txQuery<{ id: number }>(
                    'UPDATE bricks_media SET category = NULL WHERE category = $1 RETURNING id',
                    [slug]
                );

                await txQuery('DELETE FROM bricks_media_categories WHERE slug = $1', [slug]);

                return { clearedCount: cleared.length };
            });
        },
    };
}
