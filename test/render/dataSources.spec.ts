// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { shallowRef } from 'vue';

// Types
import type { IBrickDataSource } from '../../src/runtime/modules/common/types/dataSource';
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';
// #endregion

// #region Mocks
const { dataSourceFetcherMock, dataSourceClientConfig, findImportModuleMock } = vi.hoisted(() => ({
    dataSourceFetcherMock: vi.fn(),
    // Мутируемый конфиг клиента: тесты бюджета переопределяют
    // maxResponseBytes/maxRequestsPerPage/totalDeadlineMs перед вызовом композаблов.
    dataSourceClientConfig: {
        maxResponseBytes: 1024 * 1024,
        maxRequestsPerPage: 24,
        totalDeadlineMs: 15000,
    },
    findImportModuleMock: vi.fn(),
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
        useAsyncData: (_key: string, handler: () => Promise<unknown>) => {
            // `shallowRef`, а не обычный объект: иначе `computed` над результатом
            // не пересчитается после повтора — тест увидит данные первого прогона.
            // Именно shallow: глубокий прокси перекрыл бы у полезной нагрузки
            // члены прототипа, а на них стоят отдельные спеки
            const state = shallowRef<unknown>(undefined);
            const status = { value: 'idle' };
            const error = { value: null as unknown };

            /**
             * Прогоняет handler и записывает результат в состояние стаба.
             */
            async function run(): Promise<unknown> {
                status.value = 'pending';

                try {
                    state.value = await handler();
                    status.value = 'success';

                    return state.value;
                } catch (runError: unknown) {
                    error.value = runError;
                    status.value = 'error';

                    throw runError;
                }
            }

            const settled = run();

            return Object.assign(settled, {
                data: state,
                status,
                error,
                refresh: () => run(),
            });
        },
    };
});

vi.mock('../../src/runtime/modules/common/composables/useBrickImports', () => ({
    useBrickImports: () => ({ findImportModule: findImportModuleMock }),
}));
// #endregion

import { useBricksDataSources } from '../../src/runtime/modules/render/composables/useBricksDataSources';
import type { TDataSourceRequestCache } from '../../src/runtime/modules/render/types/composables';
import { DataSourceResponseTooLargeError } from '../../src/runtime/modules/render/utils/dataSourceResponseReading';

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

describe('useBricksDataSources.executeDataSource', () => {
    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        dataSourceFetcherMock.mockReset();
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

    it('значение параметра без строковой формы отбрасывается, источник пропускается', async () => {
        const { executeDataSource } = useBricksDataSources();

        const result = await executeDataSource(
            createSource({
                url: '/api/items/:filters',
                params: { filters: { from: 'component.filters' } },
            }),
            createComponent({ filters: { tag: 'news' } }),
            null
        );

        // An object used to survive the cast and travel into the URL as
        // [object Object]
        expect(result).toBeNull();
        expect(dataSourceFetcherMock).not.toHaveBeenCalled();
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('Dropped params'),
            expect.objectContaining({ rejectedParamTypes: { filters: 'object' } })
        );
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('unresolved'),
            expect.objectContaining({ unresolvedParams: ['filters'] })
        );
    });

    it('boolean подставляется как есть — это допустимый скаляр URL', async () => {
        dataSourceFetcherMock.mockResolvedValue({ items: [] });
        const { executeDataSource } = useBricksDataSources();

        await executeDataSource(
            createSource({
                url: '/api/items?draft=:draft',
                params: { draft: { value: false } },
            }),
            createComponent(),
            null
        );

        expect(dataSourceFetcherMock).toHaveBeenCalledWith('/api/items?draft=false', {
            method: 'GET',
        });
    });

    it('легальное двоеточие в query не считается незакрытым плейсхолдером', async () => {
        dataSourceFetcherMock.mockResolvedValue({ items: [] });
        const { executeDataSource } = useBricksDataSources();

        const result = await executeDataSource(
            createSource({ url: '/api/events?at=12:30' }),
            createComponent(),
            null
        );

        expect(dataSourceFetcherMock).toHaveBeenCalledWith('/api/events?at=12:30', {
            method: 'GET',
        });
        expect(result).toEqual({ items: [] });
        expect(console.warn).not.toHaveBeenCalled();
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

    // Redaction prod-логов при ошибке запроса проверяется в
    // test/render/dataSourceLogging.spec.ts (более сильная версия с SECRET-маркером).

    it('сигнал общего дедлайна прогона уходит в клиент как есть', async () => {
        // Потолок одного запроса ставит сам клиент (см. test/render/dataSourceClient.spec.ts):
        // здесь проверяется только то, что прогон не подменяет свой сигнал —
        // иначе его отмена не доехала бы до запроса и зависший источник держал бы
        // прогон до аварийного дедлайна
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

        const pending = executeDataSource(
            createSource(),
            createComponent(),
            null,
            undefined,
            sharedDeadlineController.signal
        );

        expect(dataSourceFetcherMock.mock.calls[0]?.[1]?.signal).toBe(
            sharedDeadlineController.signal
        );

        sharedDeadlineController.abort(new Error('дедлайн прогона'));

        expect(await pending).toBeNull();
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('Fetch failed'),
            expect.any(Object)
        );
    });

    it('ответ больше maxResponseBytes — результат null, prop не мержится', async () => {
        // Бюджет применяется внутри фетчера потоковым чтением;
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
