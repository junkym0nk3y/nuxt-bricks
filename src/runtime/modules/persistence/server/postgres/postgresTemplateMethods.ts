/**
 * Шаблонная часть Postgres-адаптера: записи `bricks_templates`.
 *
 * Отдельным файлом от `postgresStorageAdapter.ts` по шву домена — у страниц и
 * шаблонов нет ни одного общего запроса, а вместе файл перерос бы потолок в 500
 * строк (та же причина, что у медиа-половины). Адаптер собирает контракт
 * спредом этих методов.
 */
import { query, queryOne } from './client';
import {
    TEMPLATE_SELECT_FIELDS,
    TEMPLATE_SUMMARY_FIELDS,
    TEMPLATE_UPDATE_FIELDS,
    buildUpdateQuery,
    isRejectedPostgresWrite,
    isUniqueViolation,
} from './queryBuilders';
import {
    BricksStorageWriteRejectedError,
    BricksTemplateNameConflictError,
} from '../utils/storageErrors';
import type { TDeleteTemplateResult, TStorageTemplateMethods } from '../../types/adapters';
import type {
    IBricksTemplateRow,
    ICreateTemplatePayload,
    IUpdateTemplatePayload,
    TBricksTemplateSummary,
} from '../../../common/types/templates';

/**
 * Создаёт шаблонные методы Postgres-адаптера.
 *
 * @returns Реализация шаблонной половины контракта хранилища.
 */
export function createPostgresTemplateMethods(): TStorageTemplateMethods {
    return {
        /**
         * Сводки шаблонов, новые сверху — по дате создания (её же индексирует
         * `idx_bricks_templates_created_at`). `id DESC` вторым ключом: две
         * записи одной транзакции получают одинаковый `NOW()`, и без него их
         * порядок между запросами не определён.
         */
        async listTemplates(): Promise<TBricksTemplateSummary[]> {
            return query<TBricksTemplateSummary>(
                `SELECT ${TEMPLATE_SUMMARY_FIELDS} FROM bricks_templates
                 ORDER BY created_at DESC, id DESC`
            );
        },

        /**
         * Полный шаблон по id или null.
         */
        async getTemplate(id: number): Promise<IBricksTemplateRow | null> {
            return queryOne<IBricksTemplateRow>(
                `SELECT ${TEMPLATE_SELECT_FIELDS} FROM bricks_templates WHERE id = $1`,
                [id]
            );
        },

        /**
         * Создаёт шаблон и возвращает его полностью. Занятое имя (в том числе на
         * гонке двух одновременных создателей) → BricksTemplateNameConflictError,
         * а не драйверная ошибка.
         *
         * Прочие ДОКАЗАННЫЕ отказы вставки (запрос не ушёл, statement отменён
         * лимитом времени базы, схема или ограничение отвергли данные) уходят в
         * маркер отвергнутой записи: у создания шаблона есть внешний побочный
         * эффект — скопированный файл превью, — и убрать его ручка вправе только
         * под гарантию, что строки нет. Без маркера такой файл оставался бы
         * сиротой в хранилище (та же причина, что у вставки медиа).
         */
        async createTemplate(payload: ICreateTemplatePayload): Promise<IBricksTemplateRow> {
            let result: IBricksTemplateRow | null;

            try {
                result = await queryOne<IBricksTemplateRow>(
                    `INSERT INTO bricks_templates (name, description, thumbnail_url, schema, page_meta)
                     VALUES ($1, $2, $3, $4, $5)
                     RETURNING ${TEMPLATE_SELECT_FIELDS}`,
                    [
                        payload.name,
                        payload.description ?? null,
                        payload.thumbnailUrl ?? null,
                        JSON.stringify(payload.schema),
                        JSON.stringify(payload.pageMeta),
                    ]
                );
            } catch (error: unknown) {
                // Конфликт имени — раньше общего маркера: он и сам гарантирует
                // отказ, но клиенту нужен именно он (подсказка под полем)
                if (isUniqueViolation(error)) {
                    throw new BricksTemplateNameConflictError();
                }

                if (isRejectedPostgresWrite(error)) {
                    throw new BricksStorageWriteRejectedError(
                        'Template row was rejected by the database',
                        error
                    );
                }

                throw error;
            }

            if (!result) {
                throw new Error('Failed to create template');
            }

            return result;
        },

        /**
         * Правит подпись шаблона; null — шаблона нет. Занятое имя →
         * BricksTemplateNameConflictError.
         *
         * Пустой payload сюда не доходит: «хотя бы одно поле» требует валидатор
         * ручки — иначе PATCH без полей собрал бы `UPDATE ... SET WHERE id`.
         */
        async updateTemplate(
            id: number,
            payload: IUpdateTemplatePayload
        ): Promise<IBricksTemplateRow | null> {
            const { updates, values } = buildUpdateQuery(payload, TEMPLATE_UPDATE_FIELDS);

            if (updates.length === 0) {
                throw new Error('No fields to update');
            }

            values.push(id);

            try {
                return await queryOne<IBricksTemplateRow>(
                    `UPDATE bricks_templates
                     SET ${updates.join(', ')}
                     WHERE id = $${values.length}
                     RETURNING ${TEMPLATE_SELECT_FIELDS}`,
                    values
                );
            } catch (error: unknown) {
                if (isUniqueViolation(error)) {
                    throw new BricksTemplateNameConflictError();
                }

                throw error;
            }
        },

        /**
         * Удаляет шаблон и возвращает URL его превью (он нужен ручке для уборки
         * файла); null — шаблона нет.
         */
        async deleteTemplate(id: number): Promise<TDeleteTemplateResult> {
            return queryOne<{ thumbnailUrl: string | null }>(
                `DELETE FROM bricks_templates WHERE id = $1
                 RETURNING thumbnail_url as "thumbnailUrl"`,
                [id]
            );
        },
    };
}
