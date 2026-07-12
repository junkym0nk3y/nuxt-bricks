// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { computed } from 'vue';

// Types
import type { IBrickDataSource } from '../src/runtime/modules/common/types/dataSource';
import type { IBricksComponent } from '../src/runtime/modules/common/types/brick';
import type { IPublishedPage } from '../src/runtime/modules/common/types/bricks-api';
// #endregion

// #region Mocks
const { dataSourceFetcherMock, dataSourceClientConfig, findImportModuleMock } = vi.hoisted(() => ({
    dataSourceFetcherMock: vi.fn(),
    // Мутируемый конфиг клиента: тесты бюджета (аудит A-09) переопределяют
    // maxResponseBytes/maxRequestsPerPage/timeoutMs перед вызовом композаблов.
    dataSourceClientConfig: {
        timeoutMs: 10000,
        maxResponseBytes: 1024 * 1024,
        maxRequestsPerPage: 24,
        totalDeadlineMs: 15000,
    },
    findImportModuleMock: vi.fn(),
}));

vi.mock('../src/runtime/modules/render/composables/useDataSourceClient', () => ({
    useDataSourceClient: () => ({
        dataSourceFetcher: dataSourceFetcherMock,
        allowedHosts: ['api.example.com'],
        concurrency: 6,
        timeoutMs: dataSourceClientConfig.timeoutMs,
        maxResponseBytes: dataSourceClientConfig.maxResponseBytes,
        maxRequestsPerPage: dataSourceClientConfig.maxRequestsPerPage,
        totalDeadlineMs: dataSourceClientConfig.totalDeadlineMs,
    }),
}));

// Стаб useAsyncData: синхронно выполняет handler (см. renderDataSourcesLegacySchema.spec.ts)
vi.mock('#imports', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();

    return {
        ...actual,
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

vi.mock('../src/runtime/modules/common/composables/useBrickImports', () => ({
    useBrickImports: () => ({ findImportModule: findImportModuleMock }),
}));
// #endregion

import {
    useBricksDataSources,
    type TDataSourceRequestCache,
} from '../src/runtime/modules/render/composables/useBricksDataSources';
import { useRendererDataSources } from '../src/runtime/modules/render/composables/useRendererDataSources';
import { DataSourceResponseTooLargeError } from '../src/runtime/modules/render/utils/dataSourceResponseReading';

/**
 * Собирает минимальный компонент схемы для теста.
 */
function createComponent(props: Record<string, unknown> = {}): IBricksComponent {
    return {
        id: 'component-1',
        brickPath: 'bricks/TestBrick',
        props,
    } as unknown as IBricksComponent;
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
        schema: { components },
        published: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    };
}

describe('useBricksDataSources.executeDataSource', () => {
    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        dataSourceFetcherMock.mockReset();
        dataSourceClientConfig.timeoutMs = 10000;
        dataSourceClientConfig.maxResponseBytes = 1024 * 1024;
        dataSourceClientConfig.maxRequestsPerPage = 24;
    });

    it('выполняет GET с подстановкой параметров из props (encodeURIComponent)', async () => {
        dataSourceFetcherMock.mockResolvedValue({ items: [1, 2] });
        const { executeDataSource } = useBricksDataSources();

        const result = await executeDataSource(
            createSource({
                url: '/api/items/:category',
                params: { category: { from: 'component.category' } },
            }),
            createComponent({ category: 'news & fun' }),
            null
        );

        expect(dataSourceFetcherMock).toHaveBeenCalledWith('/api/items/news%20%26%20fun', {
            method: 'GET',
        });
        expect(result).toEqual({ items: [1, 2] });
    });

    it('пропускает data source с неразрешённым плейсхолдером', async () => {
        const { executeDataSource } = useBricksDataSources();

        const result = await executeDataSource(
            createSource({ url: '/api/items/:missing' }),
            createComponent(),
            null
        );

        expect(result).toBeNull();
        expect(dataSourceFetcherMock).not.toHaveBeenCalled();
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('unresolved'),
            expect.any(Object)
        );
    });

    it('отклоняет мутирующий метод без запроса', async () => {
        const { executeDataSource } = useBricksDataSources();

        const result = await executeDataSource(
            createSource({ method: 'POST' as unknown as IBrickDataSource['method'] }),
            createComponent(),
            null
        );

        expect(result).toBeNull();
        expect(dataSourceFetcherMock).not.toHaveBeenCalled();
    });

    it('абсолютный URL: чужой хост отклоняется, allow-listed выполняется', async () => {
        dataSourceFetcherMock.mockResolvedValue({ ok: true });
        const { executeDataSource } = useBricksDataSources();

        const denied = await executeDataSource(
            createSource({ url: 'https://evil.example/items' }),
            createComponent(),
            null
        );
        expect(denied).toBeNull();
        expect(dataSourceFetcherMock).not.toHaveBeenCalled();

        const allowed = await executeDataSource(
            createSource({ url: 'https://api.example.com/items' }),
            createComponent(),
            null
        );
        expect(allowed).toEqual({ ok: true });
        expect(dataSourceFetcherMock).toHaveBeenCalledWith('https://api.example.com/items', {
            method: 'GET',
        });
    });

    it('дедуплицирует одинаковые запросы одного прогона через requestCache', async () => {
        dataSourceFetcherMock.mockResolvedValue({ items: [] });
        const { executeDataSource } = useBricksDataSources();
        const requestCache: TDataSourceRequestCache = new Map();

        await Promise.all([
            executeDataSource(createSource(), createComponent(), null, requestCache),
            executeDataSource(
                createSource({ key: 'other', props: ['other'] }),
                createComponent(),
                null,
                requestCache
            ),
        ]);

        expect(dataSourceFetcherMock).toHaveBeenCalledTimes(1);

        // Без общего кеша — независимые запросы
        await executeDataSource(createSource(), createComponent(), null);
        expect(dataSourceFetcherMock).toHaveBeenCalledTimes(2);
    });

    it('массив оборачивается в { data }, map-функция применяется', async () => {
        dataSourceFetcherMock.mockResolvedValue([1, 2, 3]);
        const { executeDataSource } = useBricksDataSources();

        const wrapped = await executeDataSource(createSource(), createComponent(), null);
        expect(wrapped).toEqual({ data: [1, 2, 3] });

        const mapped = await executeDataSource(
            createSource({ map: (response) => ({ total: (response as number[]).length }) }),
            createComponent(),
            null
        );
        expect(mapped).toEqual({ total: 3 });
    });

    it('ошибка запроса возвращает null и логирует без params/url (prod-redaction)', async () => {
        dataSourceFetcherMock.mockRejectedValue(new Error('network down'));
        const { executeDataSource } = useBricksDataSources();

        const result = await executeDataSource(
            createSource({
                url: '/api/items/:category',
                params: { category: { value: 'secret-value' } },
            }),
            createComponent(),
            null
        );

        expect(result).toBeNull();
        const errorPayload = vi.mocked(console.error).mock.calls[0]?.[1] as Record<string, unknown>;
        expect(errorPayload).not.toHaveProperty('params');
        expect(errorPayload).not.toHaveProperty('url');
        expect(errorPayload).toMatchObject({ target: 'local', error: { name: 'Error' } });
    });

    it('per-request таймаут действует и при переданном общем shared signal (аудит A-09 review)', async () => {
        dataSourceClientConfig.timeoutMs = 25;
        // Фетчер имитирует поведение ofetch: висит вечно, но реагирует на abort
        // переданного сигнала (per-request таймаут должен его абортить сам,
        // shared signal дедлайна прогона не абортируется в этом тесте)
        dataSourceFetcherMock.mockImplementation(
            (_url: string, options: { signal?: AbortSignal }) =>
                new Promise((_resolve, reject) => {
                    options.signal?.addEventListener('abort', () =>
                        reject(new Error('The operation was aborted'))
                    );
                })
        );
        const { executeDataSource } = useBricksDataSources();
        const sharedDeadlineController = new AbortController();

        const result = await executeDataSource(
            createSource(),
            createComponent(),
            null,
            undefined,
            sharedDeadlineController.signal
        );

        expect(result).toBeNull();
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('Fetch failed'),
            expect.any(Object)
        );
    });

    it('ответ больше maxResponseBytes — результат null, prop не мержится (аудит A-09)', async () => {
        // Бюджет применяется внутри фетчера потоковым чтением (ре-ревью A-09);
        // для executeDataSource превышение — ошибка DataSourceResponseTooLargeError
        dataSourceFetcherMock.mockRejectedValue(new DataSourceResponseTooLargeError(5000, 10));
        const { executeDataSource } = useBricksDataSources();

        const result = await executeDataSource(createSource(), createComponent(), null);

        expect(result).toBeNull();
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('byte budget'),
            expect.objectContaining({ responseSizeBytes: 5000, maxResponseBytes: 10 })
        );
        expect(console.error).not.toHaveBeenCalled();
    });
});

describe('useRendererDataSources: бюджет запросов на прогон (аудит A-09)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        dataSourceFetcherMock.mockReset();
        findImportModuleMock.mockReset();
        dataSourceClientConfig.maxRequestsPerPage = 24;
    });

    it('при числе источников больше maxRequestsPerPage выполняется ровно maxRequestsPerPage запросов', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        dataSourceClientConfig.maxRequestsPerPage = 2;

        const component: IBricksComponent = {
            id: 'comp-1',
            type: 'component',
            componentName: 'TestBrick',
            brickPath: 'bricks/TestBrick',
            zIndex: 0,
            props: {},
        };
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
            pagename: 'budget-page',
            isPreview: false,
        });

        await ready;

        expect(dataSourceFetcherMock).toHaveBeenCalledTimes(2);
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('Request budget exceeded'),
            expect.objectContaining({ total: 5, executed: 2 })
        );
    });
});
