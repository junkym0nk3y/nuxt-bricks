// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { effectScope, reactive, ref, type EffectScope } from 'vue';

// Types
import type { IBricksComponent, IBricksSchema } from '../../src/runtime/modules/common/types/brick';
import type { TPublishedPageSummary } from '../../src/runtime/modules/common/types/bricks-api';
import type { IUsePublishSchemaImportReturn } from '../../src/runtime/modules/builder/publish/types/composables';
// #endregion

/**
 * Создание страницы из JSON-файла проходит через тот же резолвер картинок, что и
 * импорт в существующую страницу, но без подтверждения замены: заменять нечего,
 * страницы ещё нет. Отмена резолвера обязана прекратить создание, а не создать
 * страницу с неразобранными картинками.
 */

// #region Mocks
const { toasts, publishStoreMock, resolverMock } = vi.hoisted(() => ({
    toasts: [] as Array<{ message: string; variant: string }>,
    resolverMock: {
        startResolving: vi.fn(),
        handleCancel: vi.fn(),
        isModalOpen: undefined as unknown,
        state: undefined as unknown,
    },
    publishStoreMock: {
        pages: [] as TPublishedPageSummary[],
        patchPage: vi.fn(),
    },
}));

vi.mock('nuxt/app', () => ({
    // Композабл набора устройств читает runtimeConfig; пустой public даёт
    // дефолтный набор проекта — этого спекам импорта достаточно
    useRuntimeConfig: () => ({ public: {} }),
}));

vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock('../../src/runtime/modules/builder/publish/stores/publish', () => ({
    usePublishStore: () => ({
        getPageById: (id: string | number) =>
            publishStoreMock.pages.find((page) => String(page.id) === String(id)),
        patchPage: publishStoreMock.patchPage,
    }),
}));

vi.mock('../../src/runtime/modules/builder/media/composables/useSchemaImageResolver', () => ({
    useSchemaImageResolver: () => ({
        isModalOpen: resolverMock.isModalOpen,
        state: resolverMock.state,
        startResolving: resolverMock.startResolving,
        handleConfirm: vi.fn(),
        handleCancel: resolverMock.handleCancel,
        handleSkip: vi.fn(),
        setImageAction: vi.fn(),
        setGlobalAction: vi.fn(),
    }),
}));
// #endregion

import { usePublishSchemaImport } from '../../src/runtime/modules/builder/publish/composables/usePublishSchemaImport';

/**
 * Собирает компонент схемы.
 *
 * @param id - Идентификатор компонента.
 * @returns Компонент схемы.
 */
function buildComponent(id: string): IBricksComponent {
    return {
        id,
        type: 'layout',
        componentName: 'grid',
        brickPath: '/layouts/grid',
        zIndex: 1,
        props: {},
        children: [],
    };
}

/**
 * Поднимает координатор импорта с управляемым признаком выбранной страницы.
 *
 * @param selectedPageId - Реактивный id выбранной в списке страницы.
 * @returns Scope и API координатора.
 */
function mountCoordinator(selectedPageId: { value: string | null }): {
    scope: EffectScope;
    coordinator: IUsePublishSchemaImportReturn;
} {
    const scope = effectScope();

    const coordinator = scope.run(() =>
        usePublishSchemaImport({
            onNotify: (message, variant) => toasts.push({ message, variant }),
            isTargetSelected: (pageId) => selectedPageId.value === String(pageId),
        })
    ) as IUsePublishSchemaImportReturn;

    return { scope, coordinator };
}

describe('импорт схемы при создании страницы', () => {
    beforeEach(() => {
        toasts.length = 0;
        publishStoreMock.pages = [];
        publishStoreMock.patchPage.mockReset();
        resolverMock.startResolving.mockReset();
        resolverMock.handleCancel.mockReset();
        resolverMock.isModalOpen = ref(false);
        resolverMock.state = reactive({
            newImages: [],
            actions: new Map(),
            globalAction: 'keep',
        });
    });

    it('схема прогоняется через резолвер без подтверждения замены', async () => {
        const selected = ref<string | null>(null);
        const { scope, coordinator } = mountCoordinator(selected);
        const schema: IBricksSchema = { components: [buildComponent('grid-1')] };

        resolverMock.startResolving.mockResolvedValue({ schema, isComparisonSkipped: false });

        const resolved = await coordinator.resolveSchemaForCreate(schema);

        // Заменять нечего — страницы ещё нет, подтверждение было бы бессмысленным
        expect(coordinator.isReplaceConfirmationOpen.value).toBe(false);
        expect(resolved).toEqual(schema);

        scope.stop();
    });

    it('отмена резолвера прекращает создание', async () => {
        const selected = ref<string | null>(null);
        const { scope, coordinator } = mountCoordinator(selected);
        const schema: IBricksSchema = { components: [buildComponent('grid-1')] };

        resolverMock.startResolving.mockResolvedValue({
            schema: null,
            isComparisonSkipped: false,
        });

        const resolved = await coordinator.resolveSchemaForCreate(schema);

        expect(resolved).toBeNull();

        scope.stop();
    });
});
