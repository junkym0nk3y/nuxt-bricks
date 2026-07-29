import type { APIRequestContext } from '@playwright/test';
import type { IE2ePage, IE2ePageInput } from '../types/api';

const MUTATION_HEADERS = {
    'x-bricks-csrf': '1',
};

/**
 * Очищает страницы fake backend через публичный editorial API приложения.
 */
export async function clearPages(request: APIRequestContext): Promise<void> {
    const listResponse = await request.get('/api/bricks/');
    if (!listResponse.ok()) {
        throw new Error(`Cannot list E2E pages: ${listResponse.status()}`);
    }

    const pages = (await listResponse.json()) as IE2ePage[];
    for (const page of pages) {
        const response = await request.delete(`/api/bricks/${page.id}/`, {
            headers: MUTATION_HEADERS,
        });
        if (!response.ok()) {
            throw new Error(`Cannot delete E2E page ${page.id}: ${response.status()}`);
        }
    }
}

/**
 * Создаёт страницу через локальный Nitro API, то есть тем же маршрутом, что UI.
 */
export async function createPage(
    request: APIRequestContext,
    input: IE2ePageInput
): Promise<IE2ePage> {
    const response = await request.post('/api/bricks/', {
        headers: MUTATION_HEADERS,
        data: {
            description: input.description ?? 'E2E description',
            keywords: '',
            backgroundColor: '#ffffff',
            layout: 'default',
            socialImage: '',
            urlPrefix: null,
            subdomain: null,
            schema: input.schema ?? { components: [] },
            published: input.published ?? false,
            pagename: input.pagename,
            title: input.title,
        },
    });
    if (!response.ok()) {
        throw new Error(`Cannot create E2E page: ${response.status()} ${await response.text()}`);
    }

    return (await response.json()) as IE2ePage;
}
