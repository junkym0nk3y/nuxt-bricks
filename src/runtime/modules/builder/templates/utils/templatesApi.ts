/**
 * Запросы к ручкам шаблонов (`/api/bricks/templates/**`).
 *
 * Отдельным файлом от композаблов по тому же шву, что у страниц
 * (`publish/utils/publishApi.ts`): здесь только транспорт и форма запроса,
 * состояние раздела и разбор отказов живут выше.
 */
// Types
import type {
    IBricksTemplatePageMeta,
    IBricksTemplateRow,
    IUpdateTemplatePayload,
    TBricksTemplateSummary,
} from '../../../common/types/templates';
import type { IBricksSchema } from '../../../common/types/brick';
import type { ITemplatesListResponse } from '../types/templates';

// Composables
import { useApiClient } from '../../../common/composables/useApiClient';

// Constants
import {
    BRICKS_API_READ_TIMEOUT_MS,
    BRICKS_API_WRITE_TIMEOUT_MS,
} from '../../../common/constants/apiTimeouts';

/** Ручка списка и создания шаблонов. */
const TEMPLATES_ENDPOINT = '/api/bricks/templates';

/**
 * Тело запроса создания шаблона.
 *
 * `thumbnailSourceUrl` — кадр СТРАНИЦЫ: собственный файл превью шаблона делает
 * сервер копией, потому что ссылка на кадр страницы не переживает её следующего
 * сохранения.
 */
export interface ICreateTemplateRequestBody {
    name: string;
    description: string | null;
    schema: IBricksSchema;
    pageMeta: IBricksTemplatePageMeta;
    thumbnailSourceUrl: string | null;
}

/**
 * Читает сводки шаблонов.
 *
 * @returns Список сводок, новые сверху.
 */
export async function fetchTemplatesRequest(): Promise<TBricksTemplateSummary[]> {
    const { apiFetcher } = useApiClient();
    const response = await apiFetcher<ITemplatesListResponse>(TEMPLATES_ENDPOINT, {
        timeout: BRICKS_API_READ_TIMEOUT_MS,
    });

    return response.templates;
}

/**
 * Читает полный шаблон (со схемой и оформлением) point-lookup'ом.
 *
 * @param id - Идентификатор шаблона.
 * @returns Полная строка шаблона.
 */
export async function fetchTemplateRequest(id: number): Promise<IBricksTemplateRow> {
    const { apiFetcher } = useApiClient();

    return await apiFetcher<IBricksTemplateRow>(`${TEMPLATES_ENDPOINT}/${id}`, {
        timeout: BRICKS_API_READ_TIMEOUT_MS,
    });
}

/**
 * Сохраняет страницу как шаблон.
 *
 * @param body - Содержимое, оформление и кадр страницы-источника.
 * @returns Созданный шаблон целиком.
 */
export async function createTemplateRequest(
    body: ICreateTemplateRequestBody
): Promise<IBricksTemplateRow> {
    const { apiFetcher } = useApiClient();

    return await apiFetcher<IBricksTemplateRow>(TEMPLATES_ENDPOINT, {
        method: 'POST',
        body,
        timeout: BRICKS_API_WRITE_TIMEOUT_MS,
    });
}

/**
 * Правит подпись шаблона (имя и/или описание).
 *
 * @param id - Идентификатор шаблона.
 * @param payload - Изменяемые поля подписи.
 * @returns Шаблон после правки.
 */
export async function updateTemplateRequest(
    id: number,
    payload: IUpdateTemplatePayload
): Promise<IBricksTemplateRow> {
    const { apiFetcher } = useApiClient();

    return await apiFetcher<IBricksTemplateRow>(`${TEMPLATES_ENDPOINT}/${id}`, {
        method: 'PATCH',
        body: payload,
        timeout: BRICKS_API_WRITE_TIMEOUT_MS,
    });
}

/**
 * Удаляет шаблон.
 *
 * @param id - Идентификатор шаблона.
 */
export async function deleteTemplateRequest(id: number): Promise<void> {
    const { apiFetcher } = useApiClient();

    await apiFetcher(`${TEMPLATES_ENDPOINT}/${id}`, {
        method: 'DELETE',
        timeout: BRICKS_API_WRITE_TIMEOUT_MS,
    });
}
