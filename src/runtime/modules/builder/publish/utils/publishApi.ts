import type { IBricksSchema } from '../../../common/types/brick';
import type {
    ICreatePagePayload,
    IUpdatePagePayload,
    IPageVersion,
    IPageVersionSummary,
    IPublishedPage,
    TPublishedPageSummary,
    TPublishFormState,
    TRequestErrorLike,
} from '../../../common/types/bricks-api';
import { useApiClient } from '../../../common/composables/useApiClient';
import { toSnakeCaseShallow } from '../../../common/utils/case-transform';
import {
    normalizePublishedPage,
    normalizePublishedPageSummary,
} from '../../../common/utils/bricks/publishedPage';
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
 * @param expectedRevision - Precondition optimistic locking (revision страницы
 * на момент чтения); undefined — запись без precondition (last-write-wins).
 * @returns Нормализованная страница из ответа (со свежей revision).
 * @throws Ошибка запроса, приведённая через `toRequestError`.
 */
export async function updatePageRequest(
    id: string | number,
    schema: IBricksSchema,
    formState: TPublishFormState,
    expectedRevision?: number
): Promise<IPublishedPage> {
    const { apiFetcher } = useApiClient();
    const payload: ICreatePagePayload & { expectedRevision?: number } = buildPagePayload(
        schema,
        formState
    );

    if (expectedRevision !== undefined) {
        payload.expectedRevision = expectedRevision;
    }

    try {
        const response = await apiFetcher<IPublishedPage>(`/api/bricks/${id}/`, {
            method: 'PUT',
            body: toSnakeCaseShallow(payload),
        });

        return normalizePublishedPage(response, resolveDefaultBackgroundColor());
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
 * Загружает сводки сохранённых версий страницы через GET /api/bricks/:id/versions.
 *
 * @param id - Идентификатор страницы.
 * @returns Сводки версий (без schema), новые сверху.
 * @throws Ошибка запроса, приведённая через `toRequestError`.
 */
export async function fetchPageVersionsRequest(
    id: string | number
): Promise<IPageVersionSummary[]> {
    const { apiFetcher } = useApiClient();

    try {
        return await apiFetcher<IPageVersionSummary[]>(`/api/bricks/${id}/versions/`);
    } catch (error: unknown) {
        throw toRequestError('GET', `/api/bricks/${id}/versions`, error);
    }
}

/**
 * Загружает полный снапшот версии через GET /api/bricks/:id/versions/:versionId.
 *
 * @param id - Идентификатор страницы.
 * @param versionId - Идентификатор версии.
 * @returns Полный снапшот версии (meta + schema).
 * @throws Ошибка запроса, приведённая через `toRequestError`.
 */
export async function fetchPageVersionRequest(
    id: string | number,
    versionId: number
): Promise<IPageVersion> {
    const { apiFetcher } = useApiClient();

    try {
        return await apiFetcher<IPageVersion>(`/api/bricks/${id}/versions/${versionId}/`);
    } catch (error: unknown) {
        throw toRequestError('GET', `/api/bricks/${id}/versions/${versionId}`, error);
    }
}

/**
 * Откатывает страницу к версии через POST /api/bricks/:id/versions/:versionId/restore.
 * Сервер применяет только schema + layout + backgroundColor.
 *
 * @param id - Идентификатор страницы.
 * @param versionId - Идентификатор версии.
 * @returns Нормализованная страница после отката.
 * @throws Ошибка запроса, приведённая через `toRequestError`.
 */
export async function restorePageVersionRequest(
    id: string | number,
    versionId: number
): Promise<IPublishedPage> {
    const { apiFetcher } = useApiClient();

    try {
        const response = await apiFetcher<IPublishedPage>(
            `/api/bricks/${id}/versions/${versionId}/restore/`,
            { method: 'POST' }
        );

        return normalizePublishedPage(response, resolveDefaultBackgroundColor());
    } catch (error: unknown) {
        throw toRequestError('POST', `/api/bricks/${id}/versions/${versionId}/restore`, error);
    }
}

/**
 * Загружает сводки всех страниц (editorial-список без `schema`).
 * Полную страницу со схемой отдаёт `fetchPageRequest`.
 *
 * @returns Нормализованные сводки страниц.
 * @throws Ошибка запроса, приведённая через `toRequestError`.
 */
export async function fetchAllPagesRequest(): Promise<TPublishedPageSummary[]> {
    const { apiFetcher } = useApiClient();

    try {
        const response = await apiFetcher<TPublishedPageSummary[]>('/api/bricks/');
        return response.map((page) =>
            normalizePublishedPageSummary(page, resolveDefaultBackgroundColor())
        );
    } catch (error: unknown) {
        throw toRequestError('GET', '/api/bricks', error);
    }
}

/**
 * Загружает полную страницу (со `schema`) point-lookup'ом по id.
 *
 * @param id - Идентификатор страницы.
 * @returns Нормализованная страница.
 * @throws Ошибка запроса, приведённая через `toRequestError`.
 */
export async function fetchPageRequest(id: string | number): Promise<IPublishedPage> {
    const { apiFetcher } = useApiClient();

    try {
        const response = await apiFetcher<IPublishedPage>(`/api/bricks/${id}/`);
        return normalizePublishedPage(response, resolveDefaultBackgroundColor());
    } catch (error: unknown) {
        throw toRequestError('GET', `/api/bricks/${id}`, error);
    }
}

/**
 * Загружает опубликованную страницу по `pagename` через public read-model
 * (прямой lookup без list+find).
 *
 * @param pagename - ЧПУ страницы.
 * @returns Нормализованная страница либо `null`, если страница не опубликована.
 * @throws Ошибка запроса, приведённая через `toRequestError`.
 */
export async function fetchPageByPagenameRequest(pagename: string): Promise<IPublishedPage | null> {
    const { apiFetcher } = useApiClient();
    const url = `/api/bricks/public/pages/${pagename}`;

    try {
        const page = await apiFetcher<IPublishedPage>(`${url}/`);
        return normalizePublishedPage(page, resolveDefaultBackgroundColor());
    } catch (error: unknown) {
        const status = (error as TRequestErrorLike).statusCode;

        // Public read-model неопубликованную страницу не отдаёт — это не ошибка запроса
        if (status === 404) {
            return null;
        }

        throw toRequestError('GET', url, error);
    }
}
