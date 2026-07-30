// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// #endregion

/**
 * Отказ ручки компонентов превращал библиотеку в пустую без объяснения и без
 * повтора, а селектор модалок панели свойств загружал тот же манифест вторым
 * запросом со своим независимым кешем: один отказ оставлял его пустым до
 * перезагрузки страницы.
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
import {
    createComponentManifestDeadlineError,
    isComponentManifestDeadlineError,
} from '../../src/runtime/modules/builder/app/utils/componentLibraryPolicy';
import { getModalOptions } from '../../src/runtime/modules/builder/core/composables/useModalOptions';
import { resetNuxtReadyStub, resetNuxtStateStub } from '../stubs/nuxt-imports';

const MANIFEST_RESPONSE = {
    hash: 'abc',
    bricks: [
        { name: 'TestBrick', category: 'Other', brickPath: '/components/Test.brick.ts' },
        { name: 'CallbackFormModal', category: 'Modal', brickPath: '/components/Modal.brick.ts' },
    ],
};

describe('библиотека компонентов: отказ ручки манифеста', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        findImportModuleMock.mockReturnValue(() => Promise.resolve({ brick: { values: {} } }));
        // Снимок последней успешной загрузки живёт на уровне приложения — между
        // кейсами его нужно гасить, иначе они перестанут быть независимыми
        resetNuxtStateStub();
        resetNuxtReadyStub();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        apiFetcherMock.mockReset();
        findImportModuleMock.mockReset();
    });

    it('один ответ наполняет и список компонентов, и опции модалок', async () => {
        apiFetcherMock.mockResolvedValueOnce(MANIFEST_RESPONSE);

        const { componentLibraryList, isComponentLibraryLoadFailed } = await useComponentLibrary();

        expect(apiFetcherMock).toHaveBeenCalledTimes(1);
        expect(componentLibraryList.value.some((item) => item.name === 'TestBrick')).toBe(true);
        expect(isComponentLibraryLoadFailed.value).toBe(false);

        // Модалки берутся из манифеста, а не отдельным запросом со своим кешем
        expect(getModalOptions().map((option) => option.value)).toContain('CallbackFormModal');
    });

    it('отказ поднимает признак, но оставляет layout-блоки доступными', async () => {
        apiFetcherMock.mockRejectedValueOnce(new Error('503'));

        const { componentLibraryList, isComponentLibraryLoadFailed } = await useComponentLibrary();

        expect(isComponentLibraryLoadFailed.value).toBe(true);

        // Layout-блоки манифеста не требуют: иначе на канвас нельзя положить ничего
        expect(componentLibraryList.value.length).toBeGreaterThan(0);
        expect(componentLibraryList.value.every((item) => item.category === 'Layout')).toBe(true);
    });

    it('повтор после отказа доносит компоненты и снимает признак отказа', async () => {
        apiFetcherMock.mockRejectedValueOnce(new Error('503'));

        const { componentLibraryList, isComponentLibraryLoadFailed, refreshComponentLibrary } =
            await useComponentLibrary();

        apiFetcherMock.mockResolvedValueOnce(MANIFEST_RESPONSE);
        await expect(refreshComponentLibrary()).resolves.toBe(true);

        expect(isComponentLibraryLoadFailed.value).toBe(false);
        expect(componentLibraryList.value.some((item) => item.name === 'TestBrick')).toBe(true);
    });

    it('снимок последней успешной загрузки переживает новый экземпляр страницы', async () => {
        apiFetcherMock.mockResolvedValueOnce(MANIFEST_RESPONSE);
        await useComponentLibrary();

        // Уход из билдера и повторный заход: кеш keyed-запроса к этому моменту
        // очищен, поэтому новый экземпляр начинает с пустого `data`. Кеш модалок
        // при этом сохраняется — снимок обязан жить столько же, иначе селектор
        // покажет модалки, которых в библиотеке уже нет
        apiFetcherMock.mockRejectedValueOnce(new Error('503'));

        const { componentLibraryList, isComponentLibraryLoadFailed } = await useComponentLibrary();

        expect(isComponentLibraryLoadFailed.value).toBe(true);
        expect(componentLibraryList.value.some((item) => item.name === 'TestBrick')).toBe(true);
        expect(getModalOptions().map((option) => option.value)).toContain('CallbackFormModal');
    });

    it('не дошедший за дедлайн манифест оставляет layout-блоки и признак отказа', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        apiFetcherMock.mockRejectedValueOnce(createComponentManifestDeadlineError(12000));

        const { componentLibraryList, isComponentLibraryLoadFailed } = await useComponentLibrary();

        // Загрузка деградирует, а не отклоняется: отклонение положило бы ошибку в
        // `payload._errors`, а при гидрации с ошибкой Nuxt первый запрос
        // пропускает — сайдбар пустовал бы до полной перезагрузки страницы
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('deadline exceeded'),
            expect.anything()
        );

        // Деградация — тоже отказ для интерфейса: тост и блок повтора нужны и тут
        expect(isComponentLibraryLoadFailed.value).toBe(true);
        expect(componentLibraryList.value.every((item) => item.category === 'Layout')).toBe(true);
        expect(componentLibraryList.value.length).toBeGreaterThan(0);
    });

    it('деградация по дедлайну не затирает снимок загрузки и кеш модалок', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        apiFetcherMock.mockResolvedValueOnce(MANIFEST_RESPONSE);
        await useComponentLibrary();

        // Повторный заход в билдер, на этот раз манифест не успевает: список из
        // одних layout-блоков перекрыл бы уже загруженный, а пустые модалки
        // осели бы в кеше селектора вместо пришедших с удачной загрузки
        apiFetcherMock.mockRejectedValueOnce(createComponentManifestDeadlineError(12000));

        const { componentLibraryList } = await useComponentLibrary();

        expect(componentLibraryList.value.some((item) => item.name === 'TestBrick')).toBe(true);
        expect(getModalOptions().map((option) => option.value)).toContain('CallbackFormModal');
    });

    it('обрыв запроса на потолке транспорта за дедлайн манифеста не принимается', () => {
        const transportTimeout = new Error('The server did not respond in time');
        transportTimeout.name = 'TimeoutError';

        // Совпади имена ошибок — любой транспортный таймаут молча деградировал бы
        // в библиотеку из одних layout-блоков вместо честного отказа загрузки
        expect(isComponentManifestDeadlineError(transportTimeout)).toBe(false);
        expect(isComponentManifestDeadlineError(new Error('503'))).toBe(false);
        expect(isComponentManifestDeadlineError(createComponentManifestDeadlineError(12000))).toBe(
            true
        );
    });

    it('неудачный повтор не забирает уже загруженные компоненты и кеш модалок', async () => {
        apiFetcherMock.mockResolvedValueOnce(MANIFEST_RESPONSE);

        const { componentLibraryList, isComponentLibraryLoadFailed, refreshComponentLibrary } =
            await useComponentLibrary();

        apiFetcherMock.mockRejectedValueOnce(new Error('503'));
        await expect(refreshComponentLibrary()).resolves.toBe(false);

        expect(isComponentLibraryLoadFailed.value).toBe(true);

        // Работать с тем, что уже загрузилось, отказ обновления не мешает
        expect(componentLibraryList.value.some((item) => item.name === 'TestBrick')).toBe(true);
        expect(getModalOptions().map((option) => option.value)).toContain('CallbackFormModal');
    });
});
