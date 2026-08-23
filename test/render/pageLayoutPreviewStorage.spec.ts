// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';
// #endregion

// #region Mocks
const { apiFetcher, nuxtAppMock, setPageLayout } = vi.hoisted(() => ({
    apiFetcher: vi.fn(),
    nuxtAppMock: { payload: { data: {} as Record<string, unknown> } },
    setPageLayout: vi.fn(),
}));

vi.mock('#app', () => ({
    defineNuxtRouteMiddleware: (handler: unknown) => handler,
    useNuxtApp: () => nuxtAppMock,
    setPageLayout,
}));

vi.mock('#imports', () => ({
    createError: (input: unknown) => input,
    useState: () => ({ value: [] }),
    useRequestHeaders: () => ({}),
    useRuntimeConfig: () => ({}),
}));

vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher }),
}));

vi.mock('../../src/runtime/modules/render/composables/usePublicPageClient', () => ({
    usePublicPageClient: () => ({ publicPageFetcher: vi.fn() }),
}));

vi.stubGlobal('__BRICKS_TEST_CLIENT__', true);
// #endregion

import pageLayoutMiddleware from '../../src/runtime/middleware/bricks-page-layout.global';

describe('preview page layout middleware storage fallback', () => {
    beforeEach(() => {
        apiFetcher.mockReset();
        apiFetcher.mockResolvedValue([]);
        setPageLayout.mockReset();
        nuxtAppMock.payload.data = {};
        vi.stubGlobal('window', {
            localStorage: {
                getItem: vi.fn(() => '{malformed-json'),
            },
        });
    });

    it('continues client navigation through the API when preview storage is malformed', async () => {
        const route = {
            name: 'bricks-preview',
            meta: {},
            params: { pagename: 'page-a' },
            query: {},
        };

        await expect(pageLayoutMiddleware(route as never, route as never)).resolves.toBeUndefined();

        expect(apiFetcher).toHaveBeenCalledWith('/api/bricks/');
        expect(setPageLayout).not.toHaveBeenCalled();
    });
});
