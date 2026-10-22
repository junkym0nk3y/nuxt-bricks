// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// #endregion

/**
 * Nuxt 4 empties `data` and `error` of `useAsyncData` to `undefined`, Nuxt 3 to `null`.
 * The library compared the error with `null` alone, so on Nuxt 4 every successful load
 * read as a refusal: the sidebar showed the failure block and the page raised the retry
 * toast over a library that had loaded fine.
 */

// #region Mocks
const { apiFetcherMock } = vi.hoisted(() => ({
    apiFetcherMock: vi.fn(),
}));

vi.mock('#imports', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    const { createUseAsyncDataStub } = await import('../helpers/asyncData');

    return {
        ...actual,
        useAsyncData: createUseAsyncDataStub(undefined, undefined, true),
    };
});

vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));

vi.mock('../../src/runtime/modules/common/composables/useBrickImports', () => ({
    useBrickImports: () => ({ findImportModule: vi.fn(), hasBrickModule: () => true }),
}));

vi.mock('../../src/runtime/modules/builder/core/stores/components', () => ({
    useComponentsStore: () => ({
        selectedComponentData: null,
        setSelectedComponentMetadata: vi.fn(),
    }),
}));
// #endregion

import { useComponentLibrary } from '../../src/runtime/modules/builder/app/composables/useComponentLibrary';
import { resetNuxtReadyStub, resetNuxtStateStub } from '../stubs/nuxt-imports';

const MANIFEST_RESPONSE = {
    hash: 'abc',
    bricks: [
        {
            name: 'TestBrick',
            category: 'Other',
            brickPath: '/components/Test.brick.ts',
            values: {},
        },
    ],
};

describe('component library under the Nuxt 4 empties of useAsyncData', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        resetNuxtStateStub();
        resetNuxtReadyStub();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        apiFetcherMock.mockReset();
    });

    it('does not report a successful load as a refusal', async () => {
        apiFetcherMock.mockResolvedValueOnce(MANIFEST_RESPONSE);

        const { componentLibraryList, isComponentLibraryLoadFailed } = await useComponentLibrary();

        expect(isComponentLibraryLoadFailed.value).toBe(false);
        expect(componentLibraryList.value.some((item) => item.name === 'TestBrick')).toBe(true);
    });

    it('reports a successful retry after a refusal as a success', async () => {
        apiFetcherMock.mockRejectedValueOnce(new Error('503'));

        const { isComponentLibraryLoadFailed, refreshComponentLibrary } =
            await useComponentLibrary();

        expect(isComponentLibraryLoadFailed.value).toBe(true);

        apiFetcherMock.mockResolvedValueOnce(MANIFEST_RESPONSE);
        await expect(refreshComponentLibrary()).resolves.toBe(true);

        expect(isComponentLibraryLoadFailed.value).toBe(false);
    });
});
