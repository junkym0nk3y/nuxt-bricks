// #region Imports
// Vitest
import { afterEach, describe, expect, it, vi } from 'vitest';

// Vue
import { computed } from 'vue';

// Types
import type { IPublishedPage } from '../../src/runtime/modules/common/types/bricks-api';
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';
import type { IBrickDataSource } from '../../src/runtime/modules/common/types/dataSource';
// #endregion

/**
 * BM-14 №1: аккумулятор resolved props строился как `result[component.id] ||= {}`.
 * Для `id === '__proto__'` это отдавало `Object.prototype` вместо новой корзины,
 * и пропсы датасорса записывались в глобальный прототип — на SSR-пути
 * published-страниц, то есть на весь процесс, а не на одну страницу.
 * Для `'constructor'` тем же способом писало в функцию `Object`.
 */

// #region Mocks
const executeDataSourceMock = vi.fn();
const findImportModuleMock = vi.fn();

vi.mock('#imports', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();

    return {
        ...actual,
        // Стаб useAsyncData: синхронно выполняет handler
        // (см. test/render/dataSourcesMalformedSchema.spec.ts)
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

/** Имена, которые обычный объект «находит» в `Object.prototype`. */
const PROTOTYPE_KEYS = ['__proto__', 'constructor', 'toString', 'hasOwnProperty'] as const;

/**
 * Носители, в которые уехали бы пропсы при lookup'е по прототипу.
 * Тип — `object`: значения читаются через `Reflect.get`, приведение не нужно.
 */
function getPollutionCarriers(): object[] {
    return [{}, Object, Object.prototype.toString, Object.prototype.hasOwnProperty];
}

/**
 * Компонент схемы с заданным id и brick-модулем, объявляющим data source.
 */
function makeComponent(id: string): IBricksComponent {
    return {
        id,
        type: 'component',
        componentName: 'TestBrick',
        brickPath: 'bricks/TestBrick',
        zIndex: 0,
        props: {},
    };
}

/**
 * Минимальная published-страница со схемой из переданных компонентов.
 */
function makePage(components: IBricksComponent[]): IPublishedPage {
    return {
        id: 1,
        pagename: 'proto-page',
        title: null,
        description: null,
        keywords: null,
        backgroundColor: null,
        layout: null,
        socialImage: null,
        urlPrefix: null,
        subdomain: null,
        thumbnailUrl: null,
        schema: { components },
        published: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    };
}

describe('useRendererDataSources: id компонента с именем из Object.prototype', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it.each(PROTOTYPE_KEYS)('не пишет пропсы мимо результата при id = %s', async (id) => {
        const dataSource: IBrickDataSource = {
            key: 'items',
            url: '/api/items',
            props: ['items'],
        };

        findImportModuleMock.mockReturnValue(() =>
            Promise.resolve({ brick: { dataSources: [dataSource] } })
        );
        executeDataSourceMock.mockResolvedValue({ items: [1, 2] });

        const page = computed(() => makePage([makeComponent(id)]));

        const { ready, resolvedProps } = useRendererDataSources({
            page,
            pagename: 'proto-page',
            isPreview: false,
        });

        await ready;

        expect(resolvedProps.value.get(id)).toEqual({ items: [1, 2] });

        getPollutionCarriers().forEach((carrier) => {
            expect(Reflect.get(carrier, 'items')).toBeUndefined();
        });
    });

    it('не подставляет метод прототипа, если запрошенного пропа нет в ответе', async () => {
        const dataSource: IBrickDataSource = {
            key: 'items',
            url: '/api/items',
            props: ['items', 'toString', 'constructor'],
        };

        findImportModuleMock.mockReturnValue(() =>
            Promise.resolve({ brick: { dataSources: [dataSource] } })
        );
        executeDataSourceMock.mockResolvedValue({ items: [1, 2] });

        const page = computed(() => makePage([makeComponent('comp-1')]));

        const { ready, resolvedProps } = useRendererDataSources({
            page,
            pagename: 'proto-page',
            isPreview: false,
        });

        await ready;

        const resolved = resolvedProps.value.get('comp-1') as Record<string, unknown>;

        expect(Object.getOwnPropertyNames(resolved)).toEqual(['items']);
    });

    it('отдаёт собственные значения ответа с такими же именами', async () => {
        const dataSource: IBrickDataSource = {
            key: 'items',
            url: '/api/items',
            props: ['toString'],
        };

        findImportModuleMock.mockReturnValue(() =>
            Promise.resolve({ brick: { dataSources: [dataSource] } })
        );
        executeDataSourceMock.mockResolvedValue(JSON.parse('{"toString": "own value"}'));

        const page = computed(() => makePage([makeComponent('comp-1')]));

        const { ready, resolvedProps } = useRendererDataSources({
            page,
            pagename: 'proto-page',
            isPreview: false,
        });

        await ready;

        expect(resolvedProps.value.get('comp-1')).toEqual({ toString: 'own value' });
    });
});
