/**
 * Дефолтный IStorageAdapter поверх PostgreSQL (таблицы bricks_pages / bricks_media).
 * Схема таблиц — versioned-миграции migrations/*.sql (CLI bricks-migrate);
 * runtime-DDL адаптер не выполняет — непримененные миграции проявляются
 * ошибкой 42P01/42703 с подсказкой в логе (см. client.ts).
 */
import { useRuntimeConfig } from 'nitropack/runtime';
import { query, queryOne, withTransaction } from './client';
import {
    PAGE_SELECT_FIELDS,
    PAGE_SUMMARY_FIELDS,
    PAGE_UPDATE_FIELDS,
    VERSION_SUMMARY_FIELDS,
    VERSION_SELECT_FIELDS,
    buildUpdateQuery,
    isUniqueViolation,
} from './queryBuilders';
import { createPostgresMediaMethods } from './postgresMediaMethods';
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
import type { IBricksPageAddress } from '../../../common/types/pageAddress';
import { normalizeUrlPrefix } from '../../../common/utils/bricks/pageAddress';

/**
 * Снапшот текущей строки bricks_pages в историю версий (page_updated_at = updated_at).
 * 0 строк в результате = страница не найдена.
 *
 * `thumbnail_url` копируется вместе со schema и по той же причине: снимок канваса
 * снимается ПОСЛЕ сохранения и приезжает отдельным PATCH'ем, поэтому на момент
 * снапшота thumbnail_url страницы — это кадр ровно того состояния, которое
 * снапшот и уносит в историю. Заполнять его снимком, пришедшим после снапшота,
 * нельзя: тот кадр показывает уже новое содержимое страницы.
 */
const SNAPSHOT_VERSION_SQL = `
INSERT INTO bricks_page_versions
    (page_id, pagename, title, description, keywords, social_image, layout,
     background_color, url_prefix, subdomain, thumbnail_url, schema, published,
     page_updated_at)
SELECT id, pagename, title, description, keywords, social_image, layout,
       background_color, url_prefix, subdomain, thumbnail_url, schema, published,
       updated_at
FROM bricks_pages
WHERE id = $1
RETURNING id
`;

/**
 * Обрезает историю версий страницы до N последних снапшотов.
 */
const PRUNE_VERSIONS_SQL = `
DELETE FROM bricks_page_versions
WHERE page_id = $1 AND id NOT IN (
    SELECT id FROM bricks_page_versions
    WHERE page_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2
)
`;

const DEFAULT_VERSIONS_LIMIT = 5;

/**
 * Резолвит лимит версий из runtimeConfig (env-значения приходят строками).
 * Невалидное или отрицательное значение → дефолт 5; `0` — версионирование выключено.
 *
 * @returns Целое число хранимых версий.
 */
function resolveVersionsLimit(): number {
    const raw = useRuntimeConfig().bricksVersionsLimit as unknown;
    const parsed = Number(raw);

    if (!Number.isFinite(parsed) || parsed < 0) {
        return DEFAULT_VERSIONS_LIMIT;
    }

    return Math.floor(parsed);
}

/**
 * Машинные поля, изменение которых не считается контентным: апдейт только их
 * не инкрементит revision. thumbnailUrl пишется fire-and-forget PATCH'ем после
 * снапшота канваса — если бы он двигал revision, параллельный PATCH превью
 * ронял бы следующее сохранение пользователя ложным 409.
 */
const REVISION_NEUTRAL_FIELDS: ReadonlySet<string> = new Set(['thumbnailUrl']);

/**
 * Собирает UPDATE bricks_pages из payload: контентный апдейт инкрементит
 * revision, а переданный expectedRevision становится precondition в WHERE —
 * при несовпадении UPDATE не матчит строку (optimistic locking).
 *
 * @param id - Идентификатор страницы.
 * @param payload - Изменяемые поля + опциональный expectedRevision.
 * @returns SQL и параметры; null — если изменяемых полей нет.
 */
function buildPageUpdateSql(
    id: number,
    payload: IUpdatePagePayload
): { sql: string; values: unknown[] } | null {
    const { updates, values } = buildUpdateQuery(payload, PAGE_UPDATE_FIELDS);

    if (updates.length === 0) {
        return null;
    }

    const hasContentChange = Object.entries(payload).some(
        ([key, value]) =>
            value !== undefined && PAGE_UPDATE_FIELDS.has(key) && !REVISION_NEUTRAL_FIELDS.has(key)
    );

    if (hasContentChange) {
        updates.push('revision = revision + 1');
    }

    values.push(id);
    let where = `id = $${values.length}`;

    if (payload.expectedRevision !== undefined) {
        values.push(payload.expectedRevision);
        where += ` AND revision = $${values.length}`;
    }

    const sql = `UPDATE bricks_pages
        SET ${updates.join(', ')}
        WHERE ${where}
        RETURNING ${PAGE_SELECT_FIELDS}`;

    return { sql, values };
}

/**
 * Создаёт Postgres-реализацию IStorageAdapter.
 *
 * @returns Адаптер хранилища страниц и медиа-метаданных.
 */
export function createPostgresStorageAdapter(): IStorageAdapter {
    return {
        /**
         * Readiness-проверка: `SELECT 1` через пул. Без сконфигурированной
         * строки подключения (proxy-режим) проверка пропускается — локальной
         * БД нет, отвечать 503 из-за этого нельзя.
         */
        async checkHealth(): Promise<void> {
            if (!useRuntimeConfig().bricksDatabaseUrl) {
                return;
            }

            await query('SELECT 1');
        },

        /**
         * Возвращает сводки всех страниц (без schema), отсортированные
         * по дате обновления. Полная строка — getPage/getPageByAddress.
         */
        async listPages(): Promise<TBricksPageSummaryRow[]> {
            return query<TBricksPageSummaryRow>(
                `SELECT ${PAGE_SUMMARY_FIELDS} FROM bricks_pages ORDER BY updated_at DESC`
            );
        },

        /**
         * Возвращает страницу по id или null.
         */
        async getPage(id: number): Promise<IBricksPageRow | null> {
            return queryOne<IBricksPageRow>(
                `SELECT ${PAGE_SELECT_FIELDS} FROM bricks_pages WHERE id = $1`,
                [id]
            );
        },

        /**
         * Возвращает страницу по адресу или null.
         *
         * Две ветки, а не одно `url_prefix IS NOT DISTINCT FROM $2`: второе
         * выражение B-tree индексирует только по ведущей колонке, а префикс уходит
         * в Filter. Замерено на PG 16 для случая, который эта фича и создаёт (один
         * слаг под 2000 префиксов): 393 buffer hits и 1999 отброшенных строк против
         * 3 hits у равенства — стоимость растёт с числом страниц, переиспользующих
         * слаг. Каждой ветке отвечает свой partial unique index уникальности адреса
         * (`uq_bricks_pages_address` и `…_bare`, см. migrations/0001_init.sql).
         */
        async getPageByAddress(address: IBricksPageAddress): Promise<IBricksPageRow | null> {
            const urlPrefix = normalizeUrlPrefix(address.urlPrefix);

            if (urlPrefix === null) {
                return queryOne<IBricksPageRow>(
                    `SELECT ${PAGE_SELECT_FIELDS} FROM bricks_pages
                     WHERE pagename = $1 AND url_prefix IS NULL`,
                    [address.pagename]
                );
            }

            return queryOne<IBricksPageRow>(
                `SELECT ${PAGE_SELECT_FIELDS} FROM bricks_pages
                 WHERE pagename = $1 AND url_prefix = $2`,
                [address.pagename, urlPrefix]
            );
        },

        /**
         * Создаёт страницу и возвращает её полностью.
         * Дубликат pagename (включая гонку одновременных create) →
         * BricksPageAddressConflictError, а не драйверная ошибка.
         */
        async createPage(payload: ICreatePagePayload): Promise<IBricksPageRow> {
            let result: IBricksPageRow | null;

            try {
                result = await queryOne<IBricksPageRow>(
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
            } catch (error: unknown) {
                if (isUniqueViolation(error)) {
                    throw new BricksPageAddressConflictError();
                }

                throw error;
            }

            if (!result) {
                throw new Error('Failed to create page');
            }

            return result;
        },

        /**
         * Обновляет переданные поля страницы; null — если страница не найдена.
         * Каждый успешный апдейт инкрементит revision; несовпавший
         * expectedRevision → BricksRevisionConflictError (ничего не записано),
         * занятый pagename → BricksPageAddressConflictError.
         * Если payload меняет `schema` и лимит версий > 0 — атомарно (в транзакции)
         * снапшотит прежнюю строку в bricks_page_versions и обрезает историю до N
         * (контракт IStorageAdapter.updatePage).
         */
        async updatePage(id: number, payload: IUpdatePagePayload): Promise<IBricksPageRow | null> {
            const update = buildPageUpdateSql(id, payload);

            if (!update) {
                const existing = await queryOne<{ id: number }>(
                    'SELECT id FROM bricks_pages WHERE id = $1',
                    [id]
                );

                if (!existing) {
                    return null;
                }

                throw new Error('No fields to update');
            }

            const versionsLimit = resolveVersionsLimit();

            try {
                if (payload.schema === undefined || versionsLimit === 0) {
                    const rows = await query<IBricksPageRow>(update.sql, update.values);

                    if (rows.length > 0) {
                        return rows[0];
                    }

                    // 0 строк: страницы нет (404) либо не совпал precondition (409)
                    if (payload.expectedRevision === undefined) {
                        return null;
                    }

                    const existing = await queryOne<{ id: number }>(
                        'SELECT id FROM bricks_pages WHERE id = $1',
                        [id]
                    );

                    if (!existing) {
                        return null;
                    }

                    throw new BricksRevisionConflictError(id);
                }

                return await withTransaction(async (txQuery) => {
                    // INSERT..SELECT прежней строки заодно служит existence-чеком
                    const snapshot = await txQuery<{ id: number }>(SNAPSHOT_VERSION_SQL, [id]);

                    if (snapshot.length === 0) {
                        return null;
                    }

                    const rows = await txQuery<IBricksPageRow>(update.sql, update.values);

                    if (rows.length === 0) {
                        // страница есть (снапшот прошёл) → revision mismatch;
                        // throw откатывает транзакцию вместе со снапшотом
                        throw new BricksRevisionConflictError(id);
                    }

                    await txQuery(PRUNE_VERSIONS_SQL, [id, versionsLimit]);

                    return rows[0];
                });
            } catch (error: unknown) {
                // Любое поле адреса, а не только pagename: уникален адрес целиком,
                // поэтому PATCH одного `urlPrefix` тоже собирает занятую пару — с
                // прежним условием такой конфликт уходил наружу драйверной ошибкой
                // и превращался в 500 вместо 409. Состав payload'а — единственный
                // признак: SQLSTATE приходит без имени нарушенного ограничения
                if (
                    isUniqueViolation(error) &&
                    (payload.pagename !== undefined || payload.urlPrefix !== undefined)
                ) {
                    throw new BricksPageAddressConflictError();
                }

                throw error;
            }
        },

        /**
         * Удаляет страницу; false — если страница не найдена.
         */
        async deletePage(id: number): Promise<boolean> {
            const rows = await query<{ id: number }>(
                'DELETE FROM bricks_pages WHERE id = $1 RETURNING id',
                [id]
            );

            return rows.length > 0;
        },

        /**
         * Возвращает сводки сохранённых версий страницы (без schema), новые сверху.
         */
        async listPageVersions(pageId: number): Promise<IPageVersionSummary[]> {
            return query<IPageVersionSummary>(
                `SELECT ${VERSION_SUMMARY_FIELDS} FROM bricks_page_versions
                WHERE page_id = $1
                ORDER BY created_at DESC, id DESC`,
                [pageId]
            );
        },

        /**
         * Возвращает полный снапшот версии страницы или null.
         * Фильтр по page_id не даёт читать versionId поперёк страниц.
         */
        async getPageVersion(pageId: number, versionId: number): Promise<IPageVersion | null> {
            return queryOne<IPageVersion>(
                `SELECT ${VERSION_SELECT_FIELDS} FROM bricks_page_versions
                WHERE id = $1 AND page_id = $2`,
                [versionId, pageId]
            );
        },

        ...createPostgresMediaMethods(),
    };
}
