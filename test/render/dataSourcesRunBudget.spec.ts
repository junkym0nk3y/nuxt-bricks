// #region Imports
// Vitest
import { afterEach, describe, expect, it, vi } from 'vitest';

// Vue
import { computed, effectScope, shallowRef } from 'vue';

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
import { resetNuxtReadyStub, runNuxtReadyCallbacks } from '../stubs/nuxt-imports';

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
 * Бюджеты одного прогона data sources: лимит числа запросов и общий wall-clock
 * дедлайн, а также то, чем прогон отчитывается о своей неполноте.
 *
 * Неполнота — отдельное свойство результата: без неё частичный прогон оседает в
 * payload как полный, клиент ему верит и не запрашивает недостающее, а зависший
 * источник остаётся на fallback props до перезагрузки страницы.
 */

describe('useRendererDataSources: бюджет запросов на прогон', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
        dataSourceFetcherMock.mockReset();
        findImportModuleMock.mockReset();
        dataSourceClientConfig.maxRequestsPerPage = 24;
        dataSourceClientConfig.totalDeadlineMs = 15000;
        // Отложенные колбэки готовности приложения — состояние уровня модуля:
        // без сброса восстановление одного кейса срабатывало бы в следующем
        resetNuxtReadyStub();
    });

    it('зависший источник не отбирает у страницы уже полученные props', async () => {
        vi.useFakeTimers();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        dataSourceClientConfig.totalDeadlineMs = 50;

        const component = createSourceComponent();
        const sources: IBrickDataSource[] = [
            createSource({ key: 'fast', url: '/api/fast', props: ['price'] }),
            createSource({ key: 'stuck', url: '/api/stuck', props: ['title'] }),
        ];

        findImportModuleMock.mockReturnValue(() =>
            Promise.resolve({ brick: { dataSources: sources } })
        );

        // Второй источник игнорирует abort — так ведёт себя относительный URL на
        // SSR: внутренний вызов Nitro сигнал не слушает
        const stuckResolvers: Array<(value: unknown) => void> = [];
        dataSourceFetcherMock.mockImplementation((url: string) =>
            url.includes('/api/fast')
                ? Promise.resolve({ price: 10 })
                : new Promise((resolve) => {
                      stuckResolvers.push(resolve);
                  })
        );

        const page = computed(() => makePage([component]));

        try {
            const { ready, resolvedProps } = useRendererDataSources({
                page,
                address: { pagename: 'stuck-source-page', urlPrefix: null },
                isPreview: false,
            });

            await vi.advanceTimersByTimeAsync(50 + BRICKS_SSR_DEADLINE_MARGIN_MS);
            await ready;

            // Прогон брошен по дедлайну, но успевший props отдан: внешний дедлайн
            // на весь handler отбросил бы его вместе с зависшим источником
            expect(resolvedProps.value.get('comp-1')).toEqual({ price: 10 });
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('Run abandoned after deadline'),
                expect.objectContaining({ resolvedComponents: 1 })
            );

            // Без маркера частичный результат осел бы в payload как полный:
            // клиент бы ему поверил и не запросил недостающее
            expect(runProbe.current?.data.value?.isPartial).toBe(true);
        } finally {
            stuckResolvers.forEach((resolve) => resolve({ title: 'поздний ответ' }));
        }
    });

    it('источник, оборванный по сигналу дедлайна, тоже помечает прогон неполным', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        dataSourceClientConfig.totalDeadlineMs = 50;

        const component = createSourceComponent();
        const sources: IBrickDataSource[] = [
            createSource({ key: 'fast', url: '/api/fast', props: ['price'] }),
            createSource({ key: 'slow', url: '/api/slow', props: ['title'] }),
        ];

        findImportModuleMock.mockReturnValue(() =>
            Promise.resolve({ brick: { dataSources: sources } })
        );

        // Второй источник abort слушает — так ведёт себя запрос из браузера и
        // абсолютный URL на сервере. Прогон завершается сам, поэтому аварийный
        // дедлайн не срабатывает: пометить неполноту может только сам таймер
        dataSourceFetcherMock.mockImplementation(
            (url: string, options: { signal?: AbortSignal }) =>
                url.includes('/api/fast')
                    ? Promise.resolve({ price: 10 })
                    : new Promise((_resolve, reject) => {
                          options.signal?.addEventListener('abort', () => {
                              reject(new Error('aborted by run deadline'));
                          });
                      })
        );

        const page = computed(() => makePage([component]));

        const { ready, resolvedProps } = useRendererDataSources({
            page,
            address: { pagename: 'aborted-source-page', urlPrefix: null },
            isPreview: false,
        });

        await ready;

        expect(resolvedProps.value.get('comp-1')).toEqual({ price: 10 });
        expect(runProbe.current?.data.value?.isPartial).toBe(true);

        // Аварийного дедлайна здесь нет — прогон закончился по своему сигналу
        expect(console.warn).not.toHaveBeenCalledWith(
            expect.stringContaining('Run abandoned after deadline'),
            expect.anything()
        );
    });

    it('неполный прогон догоняется ровно одним прогоном после готовности приложения', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        dataSourceClientConfig.totalDeadlineMs = 50;

        const component = createSourceComponent();
        const sources: IBrickDataSource[] = [
            createSource({ key: 'fast', url: '/api/fast', props: ['price'] }),
            createSource({ key: 'slow', url: '/api/slow', props: ['title'] }),
        ];

        findImportModuleMock.mockReturnValue(() =>
            Promise.resolve({ brick: { dataSources: sources } })
        );

        // Первый прогон теряет медленный источник по дедлайну, второй — доносит
        let isFirstRun = true;
        dataSourceFetcherMock.mockImplementation(
            (url: string, options: { signal?: AbortSignal }) => {
                if (url.includes('/api/fast')) {
                    return Promise.resolve({ price: 10 });
                }

                if (!isFirstRun) {
                    return Promise.resolve({ title: 'догнали' });
                }

                return new Promise((_resolve, reject) => {
                    options.signal?.addEventListener('abort', () => {
                        reject(new Error('aborted by run deadline'));
                    });
                });
            }
        );

        const page = computed(() => makePage([component]));

        const { ready, resolvedProps } = useRendererDataSources({
            page,
            address: { pagename: 'recovered-source-page', urlPrefix: null },
            isPreview: false,
        });

        await ready;

        const firstRunCalls = dataSourceFetcherMock.mock.calls.length;
        expect(resolvedProps.value.get('comp-1')).toEqual({ price: 10 });

        isFirstRun = false;
        runNuxtReadyCallbacks();

        await vi.waitFor(() =>
            expect(resolvedProps.value.get('comp-1')).toEqual({ price: 10, title: 'догнали' })
        );

        const recoveredRunCalls = dataSourceFetcherMock.mock.calls.length;

        // Повторные зовы хука ничего не запускают: прогон уже был, а его
        // повторный неполный результат вторую попытку не оправдывает
        runNuxtReadyCallbacks();
        runNuxtReadyCallbacks();

        expect(recoveredRunCalls).toBeGreaterThan(firstRunCalls);
        expect(dataSourceFetcherMock.mock.calls.length).toBe(recoveredRunCalls);
    });

    it('снова неполный прогон восстановления на третий круг не идёт', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        dataSourceClientConfig.totalDeadlineMs = 50;

        const component = createSourceComponent();
        const sources: IBrickDataSource[] = [
            createSource({ key: 'slow', url: '/api/slow', props: ['title'] }),
        ];

        findImportModuleMock.mockReturnValue(() =>
            Promise.resolve({ brick: { dataSources: sources } })
        );

        // Источник не отвечает никогда, поэтому и клиентский прогон выходит
        // неполным. Повторные зовы хука ниже — модель второго вызывающего (сам
        // `onNuxtReady` зовёт колбэк однажды): прогон обязан уйти только один
        dataSourceFetcherMock.mockImplementation(
            (_url: string, options: { signal?: AbortSignal }) =>
                new Promise((_resolve, reject) => {
                    options.signal?.addEventListener('abort', () => {
                        reject(new Error('aborted by run deadline'));
                    });
                })
        );

        const page = computed(() => makePage([component]));

        const { ready } = useRendererDataSources({
            page,
            address: { pagename: 'still-partial-page', urlPrefix: null },
            isPreview: false,
        });

        await ready;

        const firstRunCalls = dataSourceFetcherMock.mock.calls.length;

        runNuxtReadyCallbacks();
        await vi.waitFor(() =>
            expect(dataSourceFetcherMock.mock.calls.length).toBeGreaterThan(firstRunCalls)
        );

        const recoveredRunCalls = dataSourceFetcherMock.mock.calls.length;

        runNuxtReadyCallbacks();
        runNuxtReadyCallbacks();

        // Пауза обязательна: прогон доходит до фетчера через await импорта
        // brick-файла, и синхронная проверка не увидела бы даже запущенный третий
        await new Promise((resolve) => {
            setTimeout(resolve, 20);
        });

        expect(dataSourceFetcherMock.mock.calls.length).toBe(recoveredRunCalls);
    });

    it('уход со страницы отменяет ещё не начатое восстановление', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        dataSourceClientConfig.totalDeadlineMs = 50;

        const component = createSourceComponent();
        const sources: IBrickDataSource[] = [
            createSource({ key: 'slow', url: '/api/slow', props: ['title'] }),
        ];

        findImportModuleMock.mockReturnValue(() =>
            Promise.resolve({ brick: { dataSources: sources } })
        );
        dataSourceFetcherMock.mockImplementation(
            (_url: string, options: { signal?: AbortSignal }) =>
                new Promise((_resolve, reject) => {
                    options.signal?.addEventListener('abort', () => {
                        reject(new Error('aborted by run deadline'));
                    });
                })
        );

        const page = computed(() => makePage([component]));
        const scope = effectScope();
        const dataSources = scope.run(() =>
            useRendererDataSources({
                page,
                address: { pagename: 'left-page', urlPrefix: null },
                isPreview: false,
            })
        );

        await dataSources?.ready;

        const firstRunCalls = dataSourceFetcherMock.mock.calls.length;

        // Посетитель ушёл до конца гидрации: прогон для чужой страницы уже не
        // нужен, а Nuxt при размонтировании ещё и чистит кеш keyed-запроса
        scope.stop();
        runNuxtReadyCallbacks();
        await new Promise((resolve) => {
            setTimeout(resolve, 20);
        });

        expect(dataSourceFetcherMock.mock.calls.length).toBe(firstRunCalls);
    });

    it('при числе источников больше maxRequestsPerPage выполняется ровно maxRequestsPerPage запросов', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        dataSourceClientConfig.maxRequestsPerPage = 2;

        const component = createSourceComponent();
        const sources: IBrickDataSource[] = Array.from({ length: 5 }, (_, index) =>
            createSource({
                key: `source-${index}`,
                url: `/api/items/${index}`,
                props: [`item${index}`],
            })
        );

        findImportModuleMock.mockReturnValue(() =>
            Promise.resolve({ brick: { dataSources: sources } })
        );
        dataSourceFetcherMock.mockResolvedValue({ ok: true });

        const page = computed(() => makePage([component]));

        const { ready } = useRendererDataSources({
            page,
            address: { pagename: 'budget-page', urlPrefix: null },
            isPreview: false,
        });

        await ready;

        expect(dataSourceFetcherMock).toHaveBeenCalledTimes(2);
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('Request budget exceeded'),
            expect.objectContaining({ total: 5, executed: 2 })
        );

        // Отброшенный излишек прогон неполным не делает: клиентский повтор упрётся
        // в тот же бюджет, а стоил бы лишнего прогона на каждой странице
        expect(runProbe.current?.data.value?.isPartial).toBe(false);
        runNuxtReadyCallbacks();
        expect(dataSourceFetcherMock).toHaveBeenCalledTimes(2);
    });
});
