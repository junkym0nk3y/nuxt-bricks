// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { nextTick, reactive } from 'vue';

// Types
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';
// #endregion

/**
 * Метаданные бриков приезжают манифестом, а не импортом brick-модуля. Значит,
 * пока манифест не дошёл, редакторских данных нет ни у панели свойств, ни у
 * слотов — и оба обязаны наполниться, когда он доедет. Без этого отказ ручки
 * оставлял бы панель пустой до повторного выбора компонента, а слоты — до
 * перезагрузки страницы.
 */

// #region Mocks
const { apiFetcherMock, storeMock } = vi.hoisted(() => ({
    apiFetcherMock: vi.fn(),
    storeMock: {
        selectedComponentData: null as { id: string; component: IBricksComponent } | null,
        setSelectedComponentMetadata: vi.fn(),
        initializeComponentSlots: vi.fn(),
        getComponentById: vi.fn(),
    },
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
    useBrickImports: () => ({ findImportModule: vi.fn(), hasBrickModule: () => true }),
}));

vi.mock('../../src/runtime/modules/builder/core/stores/components', () => ({
    useComponentsStore: () => storeMock,
}));
// #endregion

import { useComponentLibrary } from '../../src/runtime/modules/builder/app/composables/useComponentLibrary';
import { useComponentSlots } from '../../src/runtime/modules/builder/canvas/item/composables/useComponentSlots';
import { useBrickMetadata } from '../../src/runtime/modules/builder/core/composables/useBrickMetadata';
import { resetNuxtReadyStub, resetNuxtStateStub } from '../stubs/nuxt-imports';

const BRICK_PATH = '/components/Card.brick.ts';

const MANIFEST_RESPONSE = {
    hash: 'abc',
    bricks: [
        {
            name: 'Card',
            category: 'Other',
            brickPath: BRICK_PATH,
            description: 'Карточка',
            values: { headline: { type: 'input', default: 'Заголовок' } },
            slots: [{ name: 'body', label: 'Тело', allowMultiple: true }],
        },
    ],
};

describe('метаданные бриков доезжают до открытых поверхностей билдера', () => {
    beforeEach(() => {
        resetNuxtStateStub();
        resetNuxtReadyStub();
        storeMock.selectedComponentData = null;
        storeMock.setSelectedComponentMetadata.mockReset();
        storeMock.initializeComponentSlots.mockReset();
        storeMock.getComponentById.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        apiFetcherMock.mockReset();
    });

    it('удачный повтор наполняет уже открытую панель свойств без нового выбора', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        apiFetcherMock.mockRejectedValueOnce(new Error('503'));

        const { refreshComponentLibrary } = await useComponentLibrary();

        // Компонент выбрали, пока манифеста не было: панель открыта и пуста
        storeMock.selectedComponentData = {
            id: 'c1',
            component: {
                id: 'c1',
                type: 'component',
                componentName: 'Card',
                brickPath: BRICK_PATH,
                zIndex: 1,
                props: {},
            },
        };

        apiFetcherMock.mockResolvedValueOnce(MANIFEST_RESPONSE);
        await expect(refreshComponentLibrary()).resolves.toBe(true);

        expect(storeMock.setSelectedComponentMetadata).toHaveBeenCalledWith(
            'c1',
            [expect.objectContaining({ name: 'headline' })],
            'Карточка'
        );
    });

    it('запоздавшие метаданные добирают слоты компонента на канвасе', async () => {
        const component = reactive<IBricksComponent>({
            id: 'c1',
            type: 'component',
            componentName: 'Card',
            brickPath: BRICK_PATH,
            zIndex: 1,
            props: {},
        });

        storeMock.getComponentById.mockReturnValue(component);

        useComponentSlots('c1', BRICK_PATH, false, {});
        await nextTick();

        // Манифеста ещё нет: «слотов нет» — не ответ, а отсутствие ответа
        expect(storeMock.initializeComponentSlots).not.toHaveBeenCalled();

        useBrickMetadata().replaceBrickMetadata(MANIFEST_RESPONSE.bricks);
        await nextTick();

        expect(storeMock.initializeComponentSlots).toHaveBeenCalledWith('c1', [
            { name: 'body', label: 'Тело', allowMultiple: true },
        ]);
    });
});
