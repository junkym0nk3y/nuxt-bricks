// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Vue
import { computed } from 'vue';

// Types
import type { IPublishedPage } from '../../src/runtime/modules/common/types/bricks-api';
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';
import type { IBrickDataSource } from '../../src/runtime/modules/common/types/dataSource';
// #endregion

/**
 * Регрессия структурного контракта схемы: `useRendererDataSources` итерировал
 * СЫРЫЕ `page.schema.components` и обращался к `component.brickPath` без
 * shape-guard'а — повреждённая строка БД вида `[null, 42, {...}]` роняла SSR
 * TypeError'ом до самого рендера (см. `dataSourcesReady` await в
 * `render/pages/[pagename].vue`). Тест воспроизводит это условиями,
 * приближёнными к рантайму, минуя реальный useAsyncData/$fetch Nuxt.
 */

// #region Mocks
const executeDataSourceMock = vi.fn();
const findImportModuleMock = vi.fn();

vi.mock('#imports', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();

    return {
        ...actual,
        // Минимальный стаб useAsyncData: синхронно выполняет handler и отдаёт
        // объект, совместимый с `await dataSourcesReady` в [pagename].vue.
        useAsyncData: (_key: string, handler: () => Promise<unknown>) => {
            const promise = handler();
            const state = { value: undefined as unknown };
            const settled = promise.then((result) => {
                state.value = result;
                return result;
            });

            return Object.assign(settled, {
                data: state,
                status: { value: 'success' },
                error: { value: null },
                refresh: () => promise,
            });
        },
    };
});

vi.mock('../../src/runtime/modules/common/composables/useBrickImports', () => ({
    useBrickImports: () => ({ findImportModule: findImportModuleMock }),
}));

vi.mock('../../src/runtime/modules/render/composables/useBricksDataSources', () => ({
    useBricksDataSources: () => ({
        executeDataSource: executeDataSourceMock,
        concurrency: 6,
        maxRequestsPerPage: 24,
        totalDeadlineMs: 15000,
    }),
}));
// #endregion

import { useRendererDataSources } from '../../src/runtime/modules/render/composables/useRendererDataSources';

/**
 * Валидный компонент схемы с dataSources у brick-модуля.
 */
function makeValidComponent(): IBricksComponent {
    return {
        id: 'comp-1',
        type: 'component',
        componentName: 'TestBrick',
        brickPath: 'bricks/TestBrick',
        zIndex: 0,
        props: {},
    };
}

/**
 * Собирает минимальную published-страницу со схемой из переданных компонентов.
 */
function makePage(components: unknown[]): IPublishedPage {
    return {
        id: 1,
        pagename: 'broken-page',
        title: null,
        description: null,
        keywords: null,
        backgroundColor: null,
        layout: null,
        socialImage: null,
        urlPrefix: null,
        subdomain: null,
        thumbnailUrl: null,
        schema: { components: components as IBricksComponent[] },
        published: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    };
}

describe('useRendererDataSources: повреждённая схема не роняет SSR', () => {
    it('пропускает null/примитивы, собирает data sources только для валидного компонента', async () => {
        const validComponent = makeValidComponent();
        const dataSource: IBrickDataSource = {
            key: 'items',
            url: '/api/items',
            props: ['items'],
        };

        findImportModuleMock.mockReturnValue(() =>
            Promise.resolve({ brick: { dataSources: [dataSource] } })
        );
        executeDataSourceMock.mockResolvedValue({ items: [1, 2] });

        const page = computed(() => makePage([null, 42, {}, validComponent]));

        const { ready, resolvedProps } = useRendererDataSources({
            page,
            pagename: 'broken-page',
            isPreview: false,
        });

        await expect(ready).resolves.toBeDefined();

        // executeDataSource вызван ровно один раз — только для валидного компонента
        expect(executeDataSourceMock).toHaveBeenCalledTimes(1);
        expect(executeDataSourceMock).toHaveBeenCalledWith(
            dataSource,
            validComponent,
            page.value,
            expect.any(Map),
            expect.any(AbortSignal)
        );
        expect(resolvedProps.value).toEqual(new Map([['comp-1', { items: [1, 2] }]]));
    });
});
