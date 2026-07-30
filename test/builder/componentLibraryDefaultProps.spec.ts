// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Types
import type { IComponentLibraryItem } from '../../src/runtime/modules/common/types/brick';
// #endregion

/**
 * `defaultProps` собирались присваиванием в аккумулятор
 * (`acc[key] = val.default`). Имена пропов объявляет brick-файл, поэтому
 * `values.__proto__` подменял прототип собираемого объекта вместо записи ключа.
 */

// #region Mocks
const { apiFetcherMock, findImportModuleMock } = vi.hoisted(() => ({
    apiFetcherMock: vi.fn(),
    findImportModuleMock: vi.fn(),
}));

vi.mock('#imports', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    const { createUseAsyncDataStub } = await import('../helpers/asyncData');

    return {
        ...actual,
        useAsyncData: createUseAsyncDataStub(),
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

/**
 * Прогоняет библиотеку компонентов для одного brick'а с заданными values.
 *
 * @param values - Объявление values из brick-файла.
 * @returns Элемент библиотеки, соответствующий brick'у.
 */
async function loadSingleBrick(values: unknown): Promise<IComponentLibraryItem> {
    apiFetcherMock.mockResolvedValue({
        bricks: [{ name: 'TestBrick', category: 'Other', brickPath: '/components/Test.brick.ts' }],
    });
    findImportModuleMock.mockReturnValue(() => Promise.resolve({ brick: { values } }));

    const { componentLibraryList } = await useComponentLibrary();
    const item = componentLibraryList.value.find((entry) => entry.name === 'TestBrick');

    expect(item).toBeDefined();

    return item as IComponentLibraryItem;
}

describe('useComponentLibrary: имена пропов из Object.prototype', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        apiFetcherMock.mockReset();
        findImportModuleMock.mockReset();
    });

    it('пропы с именами членов прототипа становятся собственными ключами', async () => {
        const item = await loadSingleBrick(
            JSON.parse(
                '{"constructor": {"default": 1}, "toString": {"default": 2}, "hasOwnProperty": {"default": 3}}'
            )
        );

        expect(Object.getOwnPropertyNames(item.defaultProps)).toEqual([
            'constructor',
            'toString',
            'hasOwnProperty',
        ]);
        expect(item.defaultProps).toEqual({ constructor: 1, toString: 2, hasOwnProperty: 3 });
    });

    it('проп __proto__ не подменяет прототип defaultProps', async () => {
        const item = await loadSingleBrick(
            JSON.parse('{"__proto__": {"default": {"polluted": true}}, "title": {"default": "ok"}}')
        );

        expect(Object.getPrototypeOf(item.defaultProps)).toBe(Object.prototype);
        expect(Object.getOwnPropertyNames(item.defaultProps)).toEqual(['title']);
        expect((item.defaultProps as { polluted?: boolean }).polluted).toBeUndefined();
    });
});
