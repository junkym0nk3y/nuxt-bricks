import type { IBricksSchema } from '../../../common/types/brick';
import type {
    IUpdatePagePayload,
    IPublishedPage,
    IPublishedPageSummary,
    TPublishFormState,
} from '../../../common/types/bricks-api';
import { useApiClient } from '../../../common/composables/useApiClient';
import { toSnakeCaseShallow } from '../../../common/utils/case-transform';
import { normalizePublishedPage } from '../../../common/utils/bricks/publishedPage';
import { resolveDefaultBackgroundColor } from './formState';
import { toRequestError } from './requestErrors';
import { buildPagePayload } from './pagePayload';

/**
 * Создаёт страницу через POST /api/bricks.
 *
 * @param schema - Схема лендинга.
 * @param formState - Данные формы публикации.
 * @returns Идентификатор и `pagename` созданной страницы.
 * @throws Ошибка запроса, приведённая через `toRequestError`.
 */
export async function publishPageRequest(
    schema: IBricksSchema,
    formState: TPublishFormState
): Promise<{ id: number; pagename: string }> {
    const { apiFetcher } = useApiClient();

    try {
        return await apiFetcher<{ id: number; pagename: string }>('/api/bricks/', {
            method: 'POST',
            body: toSnakeCaseShallow(buildPagePayload(schema, formState)),
        });
    } catch (error: unknown) {
        throw toRequestError('POST', '/api/bricks', error);
    }
}

/**
 * Полностью обновляет страницу через PUT /api/bricks/:id.
 *
 * @param id - Идентификатор страницы.
 * @param schema - Схема лендинга.
 * @param formState - Данные формы публикации.
 * @throws Ошибка запроса, приведённая через `toRequestError`.
 */
export async function updatePageRequest(
    id: string | number,
    schema: IBricksSchema,
    formState: TPublishFormState
): Promise<void> {
    const { apiFetcher } = useApiClient();

    try {
        await apiFetcher(`/api/bricks/${id}/`, {
            method: 'PUT',
            body: toSnakeCaseShallow(buildPagePayload(schema, formState)),
        });
    } catch (error: unknown) {
        throw toRequestError('PUT', `/api/bricks/${id}`, error);
    }
}

/**
 * Частично обновляет страницу через PATCH /api/bricks/:id.
 *
 * @param id - Идентификатор страницы.
 * @param payload - Частичный payload обновления.
 * @returns Нормализованная страница из ответа.
 * @throws Ошибка запроса, приведённая через `toRequestError`.
 */
export async function patchPageRequest(
    id: string | number,
    payload: IUpdatePagePayload
): Promise<IPublishedPage> {
    const { apiFetcher } = useApiClient();

    try {
        const response = await apiFetcher<IPublishedPage>(`/api/bricks/${id}/`, {
            method: 'PATCH',
            body: toSnakeCaseShallow(payload),
        });

        return normalizePublishedPage(response, resolveDefaultBackgroundColor());
    } catch (error: unknown) {
        throw toRequestError('PATCH', `/api/bricks/${id}`, error);
    }
}

/**
 * Удаляет страницу через DELETE /api/bricks/:id.
 *
 * @param id - Идентификатор страницы.
 * @throws Ошибка запроса, приведённая через `toRequestError`.
 */
export async function deletePageRequest(id: string | number): Promise<void> {
    const { apiFetcher } = useApiClient();

    try {
        await apiFetcher(`/api/bricks/${id}/`, { method: 'DELETE' });
    } catch (error: unknown) {
        throw toRequestError('DELETE', `/api/bricks/${id}`, error);
    }
}

/**
 * Загружает список всех страниц (нормализованных).
 *
 * @returns Нормализованные страницы.
 * @throws Ошибка запроса, приведённая через `toRequestError`.
 */
export async function fetchAllPagesRequest(): Promise<IPublishedPage[]> {
    const { apiFetcher } = useApiClient();

    try {
        const response = await apiFetcher<IPublishedPage[]>('/api/bricks/');
        return response.map((page) =>
            normalizePublishedPage(page, resolveDefaultBackgroundColor())
        );
    } catch (error: unknown) {
        throw toRequestError('GET', '/api/bricks', error);
    }
}

/**
 * Загружает опубликованную страницу по `pagename` (двухшаговый lookup:
 * список published → страница по id).
 *
 * @param pagename - ЧПУ страницы.
 * @returns Нормализованная страница либо `null`, если страница не опубликована.
 * @throws Ошибка запроса, приведённая через `toRequestError`.
 */
export async function fetchPageByPagenameRequest(pagename: string): Promise<IPublishedPage | null> {
    const { apiFetcher } = useApiClient();
    let errorUrl = `/api/bricks/published (lookup ${pagename})`;

    try {
        const publishedPages = await apiFetcher<IPublishedPageSummary[]>('/api/bricks/published/');

        const publishedPage = publishedPages.find(
            (candidate) => candidate.pagename === pagename && candidate.published
        );

        if (!publishedPage) {
            return null;
        }

        errorUrl = `/api/bricks/${publishedPage.id}`;
        const page = await apiFetcher<IPublishedPage>(`/api/bricks/${publishedPage.id}/`);
        return normalizePublishedPage(page, resolveDefaultBackgroundColor());
    } catch (error: unknown) {
        throw toRequestError('GET', errorUrl, error);
    }
}
