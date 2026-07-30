// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// #endregion

/**
 * На гидрации handler `useAsyncData` не исполняется — ответ приезжает готовым в
 * payload. Отсюда два поведения, проверяемых здесь.
 *
 * Кеш модалок панели свойств, наполняемый только внутри handler'а, на клиенте
 * остался бы пустым: селектор показывал бы одно «Отключено» там, где его и
 * открывают.
 *
 * А неудачный SSR-прогон так и остался бы неудачным: при гидрации с ошибкой в
 * payload Nuxt первый запрос пропускает, поэтому без клиентского восстановления
 * сайдбар пустовал бы до полной перезагрузки — которая снова ушла бы в тот же SSR.
 */

// #region Mocks
// Фабрика мока поднимается наверх файла, поэтому payload объявляется в hoisted:
// обычная константа к моменту её вызова ещё не инициализирована
const { apiFetcherMock, findImportModuleMock, payloadData, partialPayloadData } = vi.hoisted(() => {
    const layoutItem = {
        name: 'BlockGrid',
        category: 'Layout',
        brickPath: 'layout/grid',
        thumbnail: '',
        defaultProps: {},
        slots: [],
    };

    return {
        apiFetcherMock: vi.fn(),
        findImportModuleMock: vi.fn(),
        payloadData: {
            hash: 'abc',
            isPartial: false,
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
        // Ответ ручки не дошёл за SSR-дедлайн: в payload только layout-блоки
        partialPayloadData: {
            hash: '',
            isPartial: true,
            items: [layoutItem],
            modals: [],
        },
    };
});

const asyncDataMode: { cachedData?: unknown; cachedError?: unknown } = {};

vi.mock('#imports', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    const { createUseAsyncDataStub } = await import('../helpers/asyncData');

    return {
        ...actual,
        useAsyncData: (key: string, handler: () => Promise<unknown>) =>
            createUseAsyncDataStub(asyncDataMode.cachedData, asyncDataMode.cachedError)(
                key,
                handler
            ),
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
import {
    getModalOptions,
    replaceModalsCache,
} from '../../src/runtime/modules/builder/core/composables/useModalOptions';
import {
    resetNuxtReadyStub,
    resetNuxtStateStub,
    runNuxtReadyCallbacks,
} from '../stubs/nuxt-imports';

const MANIFEST_RESPONSE = {
    hash: 'def',
    bricks: [
        { name: 'TestBrick', category: 'Other', brickPath: '/components/Test.brick.ts' },
        { name: 'CallbackFormModal', category: 'Modal', brickPath: '/components/Modal.brick.ts' },
    ],
};

describe('библиотека компонентов: ответ из payload вместо повторной загрузки', () => {
    beforeEach(() => {
        findImportModuleMock.mockReturnValue(() => Promise.resolve({ brick: { values: {} } }));
        resetNuxtStateStub();
        resetNuxtReadyStub();
        // Кеш модалок — состояние уровня модуля: без сброса опции, записанные
        // одним кейсом, доезжают до следующего, и проверка «восстановление
        // наполнило кеш» проходила бы и без самого наполнения
        replaceModalsCache([]);
        asyncDataMode.cachedData = payloadData;
        asyncDataMode.cachedError = undefined;
    });

    afterEach(() => {
        vi.restoreAllMocks();
        apiFetcherMock.mockReset();
        findImportModuleMock.mockReset();
    });

    it('кеш модалок наполняется готовым ответом, без обращения к ручке', async () => {
        const { componentLibraryList, isComponentLibraryLoadFailed } = await useComponentLibrary();

        runNuxtReadyCallbacks();

        expect(apiFetcherMock).not.toHaveBeenCalled();
        expect(isComponentLibraryLoadFailed.value).toBe(false);
        expect(componentLibraryList.value.map((item) => item.name)).toEqual(['TestBrick']);
        expect(getModalOptions().map((option) => option.value)).toContain('CallbackFormModal');
    });

    it('деградированный ответ из payload догоняется запросом после готовности приложения', async () => {
        asyncDataMode.cachedData = partialPayloadData;

        const { componentLibraryList, isComponentLibraryLoadFailed } = await useComponentLibrary();

        // До готовности приложения запроса нет: пока идёт гидрация, повтор
        // вернулся бы тем же ответом из payload, не дойдя до ручки
        expect(apiFetcherMock).not.toHaveBeenCalled();
        expect(isComponentLibraryLoadFailed.value).toBe(true);

        apiFetcherMock.mockResolvedValue(MANIFEST_RESPONSE);
        runNuxtReadyCallbacks();
        await vi.waitFor(() => expect(isComponentLibraryLoadFailed.value).toBe(false));

        expect(apiFetcherMock).toHaveBeenCalledTimes(1);
        expect(componentLibraryList.value.some((item) => item.name === 'TestBrick')).toBe(true);
        // Успешное восстановление обязано зафиксировать снимок и кеш модалок:
        // иначе следующий заход с отказом откатится к пустому селектору
        expect(getModalOptions().map((option) => option.value)).toContain('CallbackFormModal');
    });

    it('отказ SSR-прогона из payload догоняется тем же одним запросом', async () => {
        asyncDataMode.cachedData = undefined;
        asyncDataMode.cachedError = new Error('503');

        const { componentLibraryList, isComponentLibraryLoadFailed } = await useComponentLibrary();

        expect(apiFetcherMock).not.toHaveBeenCalled();
        expect(isComponentLibraryLoadFailed.value).toBe(true);

        apiFetcherMock.mockResolvedValue(MANIFEST_RESPONSE);
        runNuxtReadyCallbacks();
        await vi.waitFor(() => expect(isComponentLibraryLoadFailed.value).toBe(false));

        expect(apiFetcherMock).toHaveBeenCalledTimes(1);
        expect(componentLibraryList.value.some((item) => item.name === 'TestBrick')).toBe(true);
    });

    it('восстановление уходит ровно однажды, сколько бы раз его ни позвали', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        asyncDataMode.cachedData = undefined;
        asyncDataMode.cachedError = new Error('503');

        const { isComponentLibraryLoadFailed } = await useComponentLibrary();

        // Повторные зовы хука — модель второго вызывающего, а не поведения Nuxt:
        // настоящий `onNuxtReady` зовёт колбэк однажды. Проверяется свойство самой
        // функции восстановления — запрос уходит с первого зова и только с него
        apiFetcherMock.mockRejectedValue(new Error('503'));
        runNuxtReadyCallbacks();
        await vi.waitFor(() => expect(apiFetcherMock).toHaveBeenCalledTimes(1));

        runNuxtReadyCallbacks();
        runNuxtReadyCallbacks();

        expect(apiFetcherMock).toHaveBeenCalledTimes(1);
        expect(isComponentLibraryLoadFailed.value).toBe(true);
    });
});
