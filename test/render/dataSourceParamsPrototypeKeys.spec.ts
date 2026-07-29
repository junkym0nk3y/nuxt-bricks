// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Types
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';
import type { IBrickDataSource } from '../../src/runtime/modules/common/types/dataSource';
// #endregion

/**
 * Подстановка параметров data source сверяла имена через `in`
 * и через `segment in acc` в `getValueByPath`. Плейсхолдер `:toString` и путь
 * `component.constructor` считались разрешёнными и подставлялись членами
 * `Object.prototype`, то есть запрос уходил по URL с исходником функции
 * вместо того, чтобы быть пропущенным как неразрешённый.
 */

// #region Mocks
const { dataSourceFetcherMock } = vi.hoisted(() => ({
    dataSourceFetcherMock: vi.fn(),
}));

vi.mock('../../src/runtime/modules/render/composables/useDataSourceClient', () => ({
    useDataSourceClient: () => ({
        dataSourceFetcher: dataSourceFetcherMock,
        allowedHosts: [],
        concurrency: 6,
        timeoutMs: 10000,
        maxResponseBytes: 1024 * 1024,
        maxRequestsPerPage: 24,
        totalDeadlineMs: 15000,
    }),
}));
// #endregion

import { useBricksDataSources } from '../../src/runtime/modules/render/composables/useBricksDataSources';

/** Имена, которые обычный объект «находит» в `Object.prototype`. */
const PROTOTYPE_KEYS = ['constructor', 'toString', 'hasOwnProperty'] as const;

/**
 * Собирает минимальный компонент схемы для теста.
 */
function createComponent(props: Record<string, unknown> = {}): IBricksComponent {
    return {
        id: 'component-1',
        type: 'component',
        componentName: 'TestBrick',
        brickPath: 'bricks/TestBrick',
        zIndex: 0,
        props,
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

describe('executeDataSource: имена параметров из Object.prototype', () => {
    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        dataSourceFetcherMock.mockReset();
    });

    it.each(PROTOTYPE_KEYS)('плейсхолдер :%s без параметра остаётся неразрешённым', async (key) => {
        const { executeDataSource } = useBricksDataSources();

        const result = await executeDataSource(
            createSource({ url: `/api/items/:${key}` }),
            createComponent(),
            null
        );

        expect(result).toBeNull();
        expect(dataSourceFetcherMock).not.toHaveBeenCalled();
    });

    it.each(PROTOTYPE_KEYS)('путь component.%s не резолвится из пустых props', async (key) => {
        const { executeDataSource } = useBricksDataSources();

        const result = await executeDataSource(
            createSource({
                url: '/api/items/:id',
                params: { id: { from: `component.${key}` } },
            }),
            createComponent(),
            null
        );

        expect(result).toBeNull();
        expect(dataSourceFetcherMock).not.toHaveBeenCalled();
    });

    it.each(PROTOTYPE_KEYS)('собственный параметр с именем %s подставляется', async (key) => {
        dataSourceFetcherMock.mockResolvedValue({ items: [1] });
        const { executeDataSource } = useBricksDataSources();

        const result = await executeDataSource(
            createSource({
                url: `/api/items/:${key}`,
                params: { [key]: { value: 'own' } },
            }),
            createComponent(),
            null
        );

        expect(dataSourceFetcherMock).toHaveBeenCalledWith('/api/items/own', { method: 'GET' });
        expect(result).toEqual({ items: [1] });
    });

    it('собственный prop компонента с именем toString резолвится по пути', async () => {
        dataSourceFetcherMock.mockResolvedValue({ items: [1] });
        const { executeDataSource } = useBricksDataSources();

        const result = await executeDataSource(
            createSource({
                url: '/api/items/:id',
                params: { id: { from: 'component.toString' } },
            }),
            createComponent(JSON.parse('{"toString": "own"}')),
            null
        );

        expect(dataSourceFetcherMock).toHaveBeenCalledWith('/api/items/own', { method: 'GET' });
        expect(result).toEqual({ items: [1] });
    });

    /**
     * Набор параметров собирался `toSafeRecord`, а тот отбрасывает
     * own-ключ `__proto__` — плейсхолдер `:__proto__` оставался неразрешённым и
     * запрос молча пропускался. Прежняя версия кейса брала `url: '/api/items/:id'`
     * и не различала реализации: `:id` не резолвился в любой из них.
     */
    it('плейсхолдер :__proto__ подставляется из одноимённого параметра', async () => {
        dataSourceFetcherMock.mockResolvedValue({ items: [1] });
        const { executeDataSource } = useBricksDataSources();

        const result = await executeDataSource(
            createSource({
                url: '/api/items/:__proto__',
                params: JSON.parse('{"__proto__": {"value": "own"}}'),
            }),
            createComponent(),
            null
        );

        expect(dataSourceFetcherMock).toHaveBeenCalledWith('/api/items/own', { method: 'GET' });
        expect(result).toEqual({ items: [1] });
        expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    });

    it('параметр __proto__ не подменяет прототип и не течёт в другие имена', async () => {
        const { executeDataSource } = useBricksDataSources();

        const result = await executeDataSource(
            createSource({
                url: '/api/items/:id',
                params: JSON.parse('{"__proto__": {"value": {"polluted": true}}}'),
            }),
            createComponent(),
            null
        );

        // `:id` не объявлен — запрос пропускается, а `__proto__` никуда не утёк
        expect(result).toBeNull();
        expect(dataSourceFetcherMock).not.toHaveBeenCalled();
        expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    });
});
