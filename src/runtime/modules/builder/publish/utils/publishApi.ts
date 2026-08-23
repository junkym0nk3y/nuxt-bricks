import type { IBricksSchema } from '../../../common/types/brick';
import type {
    ICreatePagePayload,
    IUpdatePagePayload,
    IPageVersionSummary,
    IPublishedPage,
    TPublishedPageSummary,
    TPublishFormState,
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
 * Creates a page through POST /api/bricks.
 *
 * @param schema - Landing schema.
 * @param formState - Publish form data.
 * @returns The normalized page from the response (the server answers with the
 * whole row, `revision` included) — the callers that need only the id read
 * `response.id`.
 * @throws A request error brought to shape by `toRequestError`.
 */
export async function publishPageRequest(
    schema: IBricksSchema,
    formState: TPublishFormState
): Promise<IPublishedPage> {
    const { apiFetcher } = useApiClient();

    try {
        const response = await apiFetcher<IPublishedPage>('/api/bricks/', {
            method: 'POST',
            body: toSnakeCaseShallow(buildPagePayload(schema, formState)),
        });

        return normalizePublishedPage(response, resolveDefaultBackgroundColor());
    } catch (error: unknown) {
        throw toRequestError('POST', '/api/bricks', error);
    }
}

/**
 * Fully updates a page through PUT /api/bricks/:id.
 *
 * @param id - Page identifier.
 * @param schema - Landing schema.
 * @param formState - Publish form data.
 * @param expectedRevision - The optimistic locking precondition (the revision of
 * the page at the moment it was read) — mandatory; a mismatch on the server → 409.
 * @returns The normalized page from the response (with a fresh revision).
 * @throws A request error brought to shape by `toRequestError`.
 */
export async function updatePageRequest(
    id: string | number,
    schema: IBricksSchema,
    formState: TPublishFormState,
    expectedRevision: number
): Promise<IPublishedPage> {
    const { apiFetcher } = useApiClient();
    const payload: ICreatePagePayload & { expectedRevision: number } = {
        ...buildPagePayload(schema, formState),
        expectedRevision,
    };

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
 * Partially updates a page through PATCH /api/bricks/:id.
 *
 * @param id - Page identifier.
 * @param payload - Partial update payload.
 * @returns The normalized page from the response.
 * @throws A request error brought to shape by `toRequestError`.
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
 * Deletes a page through DELETE /api/bricks/:id.
 *
 * @param id - Page identifier.
 * @throws A request error brought to shape by `toRequestError`.
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
 * Loads the summaries of the saved versions of a page through
 * GET /api/bricks/:id/versions.
 *
 * @param id - Page identifier.
 * @returns Version summaries (without the schema), the newest on top.
 * @throws A request error brought to shape by `toRequestError`.
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
 * Rolls a page back to a version through
 * POST /api/bricks/:id/versions/:versionId/restore. The server applies only
 * schema + layout + backgroundColor.
 *
 * @param id - Page identifier.
 * @param versionId - Version identifier.
 * @param expectedRevision - The optimistic locking precondition (the revision of
 * the page at the moment it was read) — the server demands the field; a mismatch
 * → 409.
 * @returns The normalized page after the rollback.
 * @throws A request error brought to shape by `toRequestError`.
 */
export async function restorePageVersionRequest(
    id: string | number,
    versionId: number,
    expectedRevision: number
): Promise<IPublishedPage> {
    const { apiFetcher } = useApiClient();

    try {
        const response = await apiFetcher<IPublishedPage>(
            `/api/bricks/${id}/versions/${versionId}/restore/`,
            { method: 'POST', body: toSnakeCaseShallow({ expectedRevision }) }
        );

        return normalizePublishedPage(response, resolveDefaultBackgroundColor());
    } catch (error: unknown) {
        throw toRequestError('POST', `/api/bricks/${id}/versions/${versionId}/restore`, error);
    }
}

/**
 * Loads the summaries of every page (the editorial list without the `schema`).
 * The full page with the schema is answered by `fetchPageRequest`.
 *
 * @returns Normalized page summaries.
 * @throws A request error brought to shape by `toRequestError`.
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
 * Loads a full page (with the `schema`) by a point lookup on the id.
 *
 * @param id - Page identifier.
 * @returns The normalized page.
 * @throws A request error brought to shape by `toRequestError`.
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
