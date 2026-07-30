// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';
// #endregion

/**
 * На гидрации handler `useAsyncData` не исполняется — ответ приезжает готовым в
 * payload. Кеш модалок панели свойств, наполняемый только внутри handler'а, на
 * клиенте остался бы пустым: селектор показывал бы одно «Отключено» там, где его
 * и открывают.
 */

// #region Mocks
// Фабрика мока поднимается наверх файла, поэтому payload объявляется в hoisted:
// обычная константа к моменту её вызова ещё не инициализирована
const { apiFetcherMock, findImportModuleMock, payloadData } = vi.hoisted(() => ({
    apiFetcherMock: vi.fn(),
    findImportModuleMock: vi.fn(),
    payloadData: {
        hash: 'abc',
        items: [
            {
                name: 'TestBrick',
                category: 'Other',
                brickPath: '/components/Test.brick.ts',
                thumbnail: '',
                defaultProps: {},
                slots: [],
            },
        ],
        modals: [{ name: 'CallbackFormModal', brickPath: '/components/Modal.brick.ts' }],
    },
}));

vi.mock('#imports', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    const { createUseAsyncDataStub } = await import('../helpers/asyncData');

    return {
        ...actual,
        useAsyncData: createUseAsyncDataStub(payloadData),
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
import { getModalOptions } from '../../src/runtime/modules/builder/core/composables/useModalOptions';

describe('библиотека компонентов: ответ из payload вместо повторной загрузки', () => {
    it('кеш модалок наполняется готовым ответом, без обращения к ручке', async () => {
        const { componentLibraryList, isComponentLibraryLoadFailed } = await useComponentLibrary();

        expect(apiFetcherMock).not.toHaveBeenCalled();
        expect(isComponentLibraryLoadFailed.value).toBe(false);
        expect(componentLibraryList.value.map((item) => item.name)).toEqual(['TestBrick']);
        expect(getModalOptions().map((option) => option.value)).toContain('CallbackFormModal');
    });
});
