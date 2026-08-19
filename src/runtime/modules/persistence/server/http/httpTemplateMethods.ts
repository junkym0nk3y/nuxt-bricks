/**
 * Шаблонная часть HTTP-адаптера external backend: записи шаблонов страниц.
 *
 * Отдельным файлом от `httpStorageAdapter.ts` по тому же шву, что и медиа: у
 * страниц и шаблонов нет общих запросов, а вместе файл перерос бы потолок в 500
 * строк.
 *
 * Контракт ручек — зеркало локальных `/api/bricks/templates/**`:
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
import { BricksTemplateNameConflictError } from '../utils/storageErrors';
import { TEMPLATE_CONFLICT_CODES } from '../../../common/constants/templates';
import type { TDeleteTemplateResult, TStorageTemplateMethods } from '../../types/adapters';
import type {
    IBricksTemplateRow,
    ICreateTemplatePayload,
    IUpdateTemplatePayload,
    TBricksTemplateSummary,
} from '../../../common/types/templates';

/**
 * Создаёт шаблонную часть HTTP-адаптера.
 *
 * @param client - HTTP-клиент external backend.
 * @returns Шаблонные методы контракта хранилища.
 */
export function createHttpTemplateMethods(client: IBackendHttpClient): TStorageTemplateMethods {
    return {
        /**
         * Сводки шаблонов (`GET {base}/templates`): плоский массив либо envelope
         * `{ items }` — как у медиа-листингов.
         *
         * Порядок и число блоков в сводке — обязанность backend'а: `blocksCount`
         * из схемы здесь не досчитать, схемы в сводке нет вовсе.
         */
        async listTemplates(): Promise<TBricksTemplateSummary[]> {
            const raw = await client.request('GET', 'templates');

            return normalizeRows<TBricksTemplateSummary>(
                unwrapItemsList(raw, 'GET templates'),
                'GET templates'
            );
        },

        /**
         * Полный шаблон по id (`GET {base}/templates/:id`); 404 → null.
         */
        async getTemplate(id: number): Promise<IBricksTemplateRow | null> {
            try {
                const raw = await client.request('GET', `templates/${id}`);

                return normalizeRow<IBricksTemplateRow>(raw, `GET template ${id}`);
            } catch (error: unknown) {
                if (isNotFoundError(error)) {
                    return null;
                }

                throw error;
            }
        },

        /**
         * Создаёт шаблон (`POST {base}/templates`). На доменную ошибку маппится
         * только точный контрактный код: 409 `TEMPLATE_NAME_CONFLICT` →
         * BricksTemplateNameConflictError. 409 без кода или с незнакомым кодом —
         * generic error: посторонний конфликт backend'а (квота, состояние) не
         * должен заставлять форму краснеть полем имени.
         */
        async createTemplate(payload: ICreateTemplatePayload): Promise<IBricksTemplateRow> {
            try {
                const raw = await client.request('POST', 'templates', payload);

                return normalizeRow<IBricksTemplateRow>(raw, 'POST template');
            } catch (error: unknown) {
                if (isConflictError(error) && error.errorCode === TEMPLATE_CONFLICT_CODES.name) {
                    throw new BricksTemplateNameConflictError();
                }

                throw error;
            }
        },

        /**
         * Правит подпись шаблона (`PATCH {base}/templates/:id`); 404 → null,
         * 409 `TEMPLATE_NAME_CONFLICT` → BricksTemplateNameConflictError.
         */
        async updateTemplate(
            id: number,
            payload: IUpdateTemplatePayload
        ): Promise<IBricksTemplateRow | null> {
            try {
                const raw = await client.request('PATCH', `templates/${id}`, payload);

                return normalizeRow<IBricksTemplateRow>(raw, `PATCH template ${id}`);
            } catch (error: unknown) {
                if (isNotFoundError(error)) {
                    return null;
                }

                if (isConflictError(error) && error.errorCode === TEMPLATE_CONFLICT_CODES.name) {
                    throw new BricksTemplateNameConflictError();
                }

                throw error;
            }
        },

        /**
         * Удаляет шаблон (`DELETE {base}/templates/:id`); 404 → null.
         *
         * Файлы превью остаются локальными и в external-режиме, поэтому уборкой
         * занимается локальная ручка — ей нужен `thumbnail_url` удалённой записи.
         * Backend, ответивший пустым телом (204), сообщает лишь факт удаления:
         * тогда убирать нечего с точки зрения контракта, и его файл (если он
         * хранит превью сам) остаётся его заботой.
         */
        async deleteTemplate(id: number): Promise<TDeleteTemplateResult> {
            try {
                const raw = await client.request('DELETE', `templates/${id}`);

                if (raw === null) {
                    return { thumbnailUrl: null };
                }

                const row = normalizeRow<{ thumbnailUrl?: string | null }>(
                    raw,
                    `DELETE template ${id}`
                );

                return { thumbnailUrl: row.thumbnailUrl ?? null };
            } catch (error: unknown) {
                if (isNotFoundError(error)) {
                    return null;
                }

                throw error;
            }
        },
    };
}
