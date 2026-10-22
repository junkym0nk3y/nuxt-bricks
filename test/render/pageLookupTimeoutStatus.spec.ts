/**
 * The status a failed page lookup reaches the visitor under.
 *
 * A lookup timeout is not "there is no such page": a 404 for it would be cached by
 * the CDN and read by a crawler as the page being gone, so an unresponsive backend
 * has to answer 504 while an ordinary miss stays 404. The recognition of a nested
 * timeout is the business of `isRequestTimeoutError` and is covered there; what is
 * checked here is the conversion the middleware itself makes.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';
// #endregion

// #region Mocks
const { publicPageFetcher, nuxtAppMock } = vi.hoisted(() => ({
    publicPageFetcher: vi.fn(),
    nuxtAppMock: { payload: { data: {} as Record<string, unknown> } },
}));

vi.mock('#app', () => ({
    defineNuxtRouteMiddleware: (handler: unknown) => handler,
    useNuxtApp: () => nuxtAppMock,
    setPageLayout: vi.fn(),
}));

vi.mock('#imports', () => ({
    createError: (input: unknown) => input,
    useState: () => ({ value: [] }),
    useRequestHeaders: () => ({}),
    useRuntimeConfig: () => ({}),
}));

vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: vi.fn() }),
}));

vi.mock('../../src/runtime/modules/render/composables/usePublicPageClient', () => ({
    usePublicPageClient: () => ({ publicPageFetcher }),
}));
// #endregion

import pageLayoutMiddleware from '../../src/runtime/middleware/bricks-page-layout.global';

/** Route of a published page: the live lookup goes through the public read model. */
const PUBLISHED_ROUTE = {
    name: 'bricks-page',
    meta: { isPublishedBricksPage: true },
    params: { pagename: 'post' },
    query: {},
};

/**
 * Runs the middleware over a lookup that fails with the given error.
 *
 * @param error - Rejection of the public lookup.
 * @returns The status the middleware answers with.
 */
async function resolveStatusFor(error: unknown): Promise<number> {
    publicPageFetcher.mockRejectedValueOnce(error);

    const result = (await pageLayoutMiddleware(
        PUBLISHED_ROUTE as never,
        PUBLISHED_ROUTE as never
    )) as { statusCode: number };

    return result.statusCode;
}

describe('status of a failed live page lookup', () => {
    beforeEach(() => {
        publicPageFetcher.mockReset();
        nuxtAppMock.payload.data = {};
    });

    it('answers 504 when the lookup timed out', async () => {
        await expect(
            resolveStatusFor(Object.assign(new Error('aborted'), { name: 'TimeoutError' }))
        ).resolves.toBe(504);
    });

    it('keeps 404 for an ordinary failure of the lookup', async () => {
        await expect(resolveStatusFor(new Error('boom'))).resolves.toBe(404);
    });
});
