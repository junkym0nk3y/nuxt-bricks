// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Types
import type { IBrickDataSource } from '../src/runtime/modules/common/types/dataSource';
import type { IBricksComponent } from '../src/runtime/modules/common/types/brick';
// #endregion

// #region Mocks
const { dataSourceFetcherMock } = vi.hoisted(() => ({
    dataSourceFetcherMock: vi.fn(),
}));

vi.mock('../src/runtime/modules/render/composables/useDataSourceClient', () => ({
    useDataSourceClient: () => ({
        dataSourceFetcher: dataSourceFetcherMock,
        allowedHosts: ['api.example.com'],
        concurrency: 6,
    }),
}));
// #endregion

import {
    useBricksDataSources,
    type TDataSourceRequestCache,
} from '../src/runtime/modules/render/composables/useBricksDataSources';

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
});
