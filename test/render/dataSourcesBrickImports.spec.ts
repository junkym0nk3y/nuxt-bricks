// #region Imports
// Vitest
import { afterEach, describe, expect, it, vi } from 'vitest';

// Vue
import { computed, shallowRef } from 'vue';

// Types
import type { IBrickDataSource } from '../../src/runtime/modules/common/types/dataSource';
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';
import type { IPublishedPage } from '../../src/runtime/modules/common/types/bricks-api';
import type { IRendererDataSourcesData } from '../../src/runtime/modules/render/types/composables';
import type { IAsyncDataStub } from '../helpers/types';
// #endregion

// #region Mocks
const { dataSourceFetcherMock, dataSourceClientConfig, findImportModuleMock, runProbe } =
    vi.hoisted(() => ({
        dataSourceFetcherMock: vi.fn(),
        // Мутируемый конфиг клиента: тесты бюджета переопределяют
        // maxResponseBytes/maxRequestsPerPage/totalDeadlineMs перед вызовом композаблов.
        dataSourceClientConfig: {
            maxResponseBytes: 1024 * 1024,
            maxRequestsPerPage: 24,
            totalDeadlineMs: 15000,
        },
        findImportModuleMock: vi.fn(),
        // Состояние стаба `useAsyncData` последнего экземпляра: тест читает
        // результат прогона там же, где его читает рабочий код, — в `data.value`.
        // Через `await ready` его брать нельзя: у Nuxt промис `AsyncData`
        // разрешается объектом состояния, а не полезной нагрузкой.
        runProbe: { current: null as IAsyncDataStub<IRendererDataSourcesData> | null },
    }));

vi.mock('../../src/runtime/modules/render/composables/useDataSourceClient', () => ({
    useDataSourceClient: () => ({
        dataSourceFetcher: dataSourceFetcherMock,
        allowedHosts: ['api.example.com'],
        concurrency: 6,
        maxResponseBytes: dataSourceClientConfig.maxResponseBytes,
        maxRequestsPerPage: dataSourceClientConfig.maxRequestsPerPage,
        totalDeadlineMs: dataSourceClientConfig.totalDeadlineMs,
    }),
}));

// Стаб useAsyncData: синхронно выполняет handler (см. test/render/dataSourcesMalformedSchema.spec.ts).
// `refresh` прогоняет handler заново — иначе повтор неполного прогона проверить
// нечем: возврат прежнего промиса выглядит как повтор, не выполняя его
vi.mock('#imports', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();

    return {
        ...actual,
        useAsyncData: (_key: string, handler: () => Promise<IRendererDataSourcesData>) => {
            // Все три поля — refs: `computed` и dev-watchers рабочего кода иначе не
            // пересчитаются после повтора, и тест увидел бы данные первого прогона.
            // Именно shallow: глубокий прокси перекрыл бы у полезной нагрузки
            // члены прототипа, а на них стоят отдельные спеки
            const data = shallowRef<IRendererDataSourcesData | null>(null);
            const status = shallowRef<string>('idle');
            const error = shallowRef<unknown>(null);

            /**
             * Прогоняет handler и записывает результат в состояние стаба.
             */
            async function run(): Promise<void> {
                status.value = 'pending';

                try {
                    data.value = await handler();
                    status.value = 'success';
                } catch (runError: unknown) {
                    error.value = runError;
                    status.value = 'error';

                    throw runError;
                }
            }

            const state = { data, status, error, refresh: () => run() };
            runProbe.current = state;

            // Промис разрешается состоянием, как `AsyncData` у Nuxt
            // (`Promise<_AsyncData> & _AsyncData`): иначе тест, читающий
            // `await ready`, проверял бы форму, которой в рабочем коде нет
            return Object.assign(
                run().then(() => state),
                state
            );
        },
    };
});

vi.mock('../../src/runtime/modules/common/composables/useBrickImports', () => ({
    useBrickImports: () => ({ findImportModule: findImportModuleMock }),
}));
// #endregion

import { useRendererDataSources } from '../../src/runtime/modules/render/composables/useRendererDataSources';
import { BRICKS_SSR_DEADLINE_MARGIN_MS } from '../../src/runtime/modules/common/constants/apiTimeouts';
import { resetNuxtReadyStub } from '../stubs/nuxt-imports';

/**
 * Собирает компонент схемы, у которого brick объявляет data sources.
 */
function createSourceComponent(): IBricksComponent {
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
 * Собирает объявление data source с переопределениями.
 */
function createSource(overrides: Partial<IBrickDataSource> = {}): IBrickDataSource {
    return {
        key: 'items',
        url: '/api/items',
        props: ['items'],
        ...overrides,
    };
}

/**
 * Собирает минимальную published-страницу со схемой из переданных компонентов.
 */
function makePage(components: IBricksComponent[]): IPublishedPage {
    return {
        id: 1,
        pagename: 'budget-page',
        title: null,
        description: null,
        keywords: null,
        backgroundColor: null,
        layout: null,
        socialImage: null,
        urlPrefix: null,
        subdomain: null,
        thumbnailUrl: null,
        viewportConfig: null,
        schema: { components },
        published: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    };
}

/**
 * Сбор запросов прогона data sources: загрузка brick-модулей.
 *
 * Фаза сбора стоит ДО запросов и раньше в бюджет не входила: таймер заводился после
 * неё, поэтому зависший импорт держал SSR дольше заявленного бюджета, а обход путей
 * шёл по одному, хотя страница грузит те же модули `Promise.all`. Отказ импорта при
 * этом не кешируется — восстановительный прогон обязан попробовать снова.
 */

describe('useRendererDataSources: сбор запросов и импорты brick-модулей', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
        dataSourceFetcherMock.mockReset();
        findImportModuleMock.mockReset();
        dataSourceClientConfig.maxRequestsPerPage = 24;
        dataSourceClientConfig.totalDeadlineMs = 15000;
        resetNuxtReadyStub();
    });

    it('зависший импорт brick-модуля укладывается в бюджет прогона', async () => {
        vi.useFakeTimers();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        dataSourceClientConfig.totalDeadlineMs = 50;

        const component = createSourceComponent();

        // The import listens to no signal — there is nothing in a chunk import to listen
        // with — so the collection is bounded by waiting. While the timer started AFTER
        // the collection, a hung import sat outside the budget entirely and held SSR
        const stuckImports: Array<(value: unknown) => void> = [];
        findImportModuleMock.mockReturnValue(
            () =>
                new Promise((resolve) => {
                    stuckImports.push(resolve);
                })
        );

        const page = computed(() => makePage([component]));

        try {
            const { ready, resolvedProps } = useRendererDataSources({
                page,
                address: { pagename: 'stuck-import-page', urlPrefix: null },
                isPreview: false,
            });

            await vi.advanceTimersByTimeAsync(50 + BRICKS_SSR_DEADLINE_MARGIN_MS);
            await ready;

            expect(resolvedProps.value.size).toBe(0);
            expect(dataSourceFetcherMock).not.toHaveBeenCalled();
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('Brick imports abandoned after deadline'),
                expect.anything()
            );
            // The incompleteness has to reach the client: without it the recovery run never
            // happens, and the page stays on fallback props
            expect(runProbe.current?.data.value?.isPartial).toBe(true);
        } finally {
            stuckImports.forEach((resolve) => resolve({ brick: { dataSources: [] } }));
        }
    });

    it('упавший импорт повторяется восстановительным прогоном', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const component = createSourceComponent();
        const sources: IBrickDataSource[] = [createSource({ props: ['items'] })];

        // Failure is not remembered: the cache lives as long as the page instance, and the
        // recovery run is the second chance for a chunk that did not arrive
        const importModule = vi
            .fn()
            .mockRejectedValueOnce(new Error('chunk load failed'))
            .mockResolvedValueOnce({ brick: { dataSources: sources } });
        findImportModuleMock.mockReturnValue(importModule);
        dataSourceFetcherMock.mockResolvedValue({ items: [1, 2] });

        const page = computed(() => makePage([component]));

        const { ready, resolvedProps } = useRendererDataSources({
            page,
            address: { pagename: 'retry-import-page', urlPrefix: null },
            isPreview: false,
        });

        await ready;

        expect(resolvedProps.value.size).toBe(0);
        expect(dataSourceFetcherMock).not.toHaveBeenCalled();

        await runProbe.current?.refresh();

        expect(importModule).toHaveBeenCalledTimes(2);
        expect(resolvedProps.value.get('comp-1')).toEqual({ items: [1, 2] });
    });

    it('модули разных brick-путей грузятся одной волной, а не по очереди', async () => {
        const first = createSourceComponent();
        const second: IBricksComponent = {
            ...createSourceComponent(),
            id: 'comp-2',
            brickPath: 'bricks/OtherBrick',
        };
        // The third component repeats the path of the first: no import goes out for it
        const third: IBricksComponent = { ...createSourceComponent(), id: 'comp-3' };

        let inFlight = 0;
        let peakInFlight = 0;
        const releases: Array<() => void> = [];

        findImportModuleMock.mockImplementation((brickPath: string) => () => {
            inFlight += 1;
            peakInFlight = Math.max(peakInFlight, inFlight);

            return new Promise((resolve) => {
                releases.push(() => {
                    inFlight -= 1;
                    resolve({
                        brick: {
                            dataSources: [
                                createSource({ url: `/api/${brickPath}`, props: ['items'] }),
                            ],
                        },
                    });
                });
            });
        });
        dataSourceFetcherMock.mockResolvedValue({ items: [] });

        const page = computed(() => makePage([first, second, third]));

        const { ready } = useRendererDataSources({
            page,
            address: { pagename: 'parallel-imports-page', urlPrefix: null },
            isPreview: false,
        });

        // Both imports are in flight: a sequential walk would hold one at a time
        await vi.waitFor(() => expect(releases).toHaveLength(2));
        expect(peakInFlight).toBe(2);

        releases.forEach((release) => release());
        await ready;

        expect(findImportModuleMock).toHaveBeenCalledTimes(2);
    });
});
