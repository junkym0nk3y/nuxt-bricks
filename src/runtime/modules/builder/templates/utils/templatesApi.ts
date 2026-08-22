/**
 * The requests to the endpoints of the templates (`/api/bricks/templates/**`).
 *
 * A file of its own, apart from the composables, along the same seam as the pages
 * (`publish/utils/publishApi.ts`): only the transport and the shape of the request are
 * here, the state of the section and the reading of refusals live above.
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

/** The endpoint of the list of templates and of creating one */
const TEMPLATES_ENDPOINT = '/api/bricks/templates';

/**
 * The body of the request that creates a template.
 *
 * `thumbnailSourceUrl` is the frame of the PAGE: the preview file the template owns is
 * made by the server as a copy, because a link to the frame of a page does not outlive
 * the next save of that page.
 */
export interface ICreateTemplateRequestBody {
    name: string;
    description: string | null;
    schema: IBricksSchema;
    pageMeta: IBricksTemplatePageMeta;
    thumbnailSourceUrl: string | null;
}

/**
 * Reads the summaries of the templates.
 *
 * @returns The list of summaries, the newest on top.
 */
export async function fetchTemplatesRequest(): Promise<TBricksTemplateSummary[]> {
    const { apiFetcher } = useApiClient();
    const response = await apiFetcher<ITemplatesListResponse>(TEMPLATES_ENDPOINT, {
        timeout: BRICKS_API_READ_TIMEOUT_MS,
    });

    return response.templates;
}

/**
 * Reads the whole template (with its schema and styling) by a point lookup.
 *
 * @param id - The identifier of the template.
 * @returns The whole row of the template.
 */
export async function fetchTemplateRequest(id: number): Promise<IBricksTemplateRow> {
    const { apiFetcher } = useApiClient();

    return await apiFetcher<IBricksTemplateRow>(`${TEMPLATES_ENDPOINT}/${id}`, {
        timeout: BRICKS_API_READ_TIMEOUT_MS,
    });
}

/**
 * Saves a page as a template.
 *
 * @param body - The contents, the styling and the frame of the source page.
 * @returns The created template in full.
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
 * Edits the caption of a template (the name and/or the description).
 *
 * @param id - The identifier of the template.
 * @param payload - The fields of the caption that change.
 * @returns The template after the edit.
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
 * Deletes a template.
 *
 * @param id - The identifier of the template.
 */
export async function deleteTemplateRequest(id: number): Promise<void> {
    const { apiFetcher } = useApiClient();

    await apiFetcher(`${TEMPLATES_ENDPOINT}/${id}`, {
        method: 'DELETE',
        timeout: BRICKS_API_WRITE_TIMEOUT_MS,
    });
}
