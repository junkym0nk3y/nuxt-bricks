// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Types
import type { IComponentLibraryData } from '../../src/runtime/modules/builder/app/types/composables';
// #endregion

/**
 * Форма данных `useAsyncData('bricks-components')` — `{ hash, items }`: хеш лежит
 * рядом со списком заготовкой под будущую сверку хешей в dev. Наружу композабл
 * отдаёт только список, поэтому перенос
 * хеша из ответа ручки в данные проверяется через мок `useAsyncData`: без этого
 * кейса подмена `response?.hash` на константу оставалась бы незамеченной.
 */

// #region Mocks
const { apiFetcherMock, findImportModuleMock, captured } = vi.hoisted(() => ({
    apiFetcherMock: vi.fn(),
    findImportModuleMock: vi.fn(),
    captured: { data: null as IComponentLibraryData | null },
}));

vi.mock('#imports', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();

    return {
        ...actual,
        useAsyncData: async (_key: string, handler: () => Promise<IComponentLibraryData>) => {
            captured.data = await handler();

            return { data: { value: captured.data } };
        },
    };
});

vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));

vi.mock('../../src/runtime/modules/common/composables/useBrickImports', () => ({
    useBrickImports: () => ({ findImportModule: findImportModuleMock }),
}));
// #endregion

import { useComponentLibrary } from '../../src/runtime/modules/builder/app/composables/useComponentLibrary';

const BRICK_ENTRY = {
    name: 'TestBrick',
    category: 'Other',
    brickPath: '/components/Test.brick.ts',
};

describe('useComponentLibrary: форма данных useAsyncData', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        findImportModuleMock.mockReturnValue(() =>
            Promise.resolve({ brick: { values: { title: { default: 'ok' } } } })
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
        apiFetcherMock.mockReset();
        findImportModuleMock.mockReset();
        captured.data = null;
    });

    it('хеш манифеста из ответа ручки уезжает в данные рядом со списком', async () => {
        apiFetcherMock.mockResolvedValue({ bricks: [BRICK_ENTRY], hash: 'manifest-hash' });

        await useComponentLibrary();

        expect(captured.data?.hash).toBe('manifest-hash');
        expect(captured.data?.items.some((item) => item.name === 'TestBrick')).toBe(true);
    });

    it('ответ без хеша даёт пустую строку, список при этом собран', async () => {
        apiFetcherMock.mockResolvedValue({ bricks: [BRICK_ENTRY] });

        const { componentLibraryList } = await useComponentLibrary();

        expect(captured.data?.hash).toBe('');
        expect(componentLibraryList.value.some((item) => item.name === 'TestBrick')).toBe(true);
    });
});
