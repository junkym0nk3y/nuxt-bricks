// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Types
import type { IBrickDataSource } from '../../src/runtime/modules/common/types/dataSource';
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';

// Utils
import {
    resolveDataSourceLogTarget,
    toDataSourceLogError,
} from '../../src/runtime/modules/render/utils/dataSourceLogging';
// #endregion

// #region Mocks
const { dataSourceFetcherMock } = vi.hoisted(() => ({
    dataSourceFetcherMock: vi.fn(),
}));

vi.mock('../../src/runtime/modules/render/composables/useDataSourceClient', () => ({
    useDataSourceClient: () => ({
        dataSourceFetcher: dataSourceFetcherMock,
        allowedHosts: ['api.example.com'],
        concurrency: 6,
        maxResponseBytes: 1024 * 1024,
        maxRequestsPerPage: 24,
        totalDeadlineMs: 15000,
    }),
}));
// #endregion

import { useBricksDataSources } from '../../src/runtime/modules/render/composables/useBricksDataSources';

const SECRET = 'SECRET-MARKER-9000';

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
 * Сериализует все аргументы всех вызовов console-спая в одну строку.
 */
function stringifyCalls(spy: ReturnType<typeof vi.spyOn>): string {
    return JSON.stringify(spy.mock.calls);
}

describe('dataSourceLogging (чистые функции)', () => {
    it('resolveDataSourceLogTarget: относительный URL → local', () => {
        expect(resolveDataSourceLogTarget('/api/items/42?token=abc')).toBe('local');
    });

    it('resolveDataSourceLogTarget: абсолютный URL → только origin (без path/query)', () => {
        expect(
            resolveDataSourceLogTarget(`https://api.example.com/users/${SECRET}?token=${SECRET}`)
        ).toBe('https://api.example.com');
    });

    it('resolveDataSourceLogTarget: protocol-relative, мусор и пустая строка → invalid-url', () => {
        expect(resolveDataSourceLogTarget(`//evil.example/${SECRET}`)).toBe('invalid-url');
        expect(resolveDataSourceLogTarget(`mailto:${SECRET}@evil.example`)).toBe('invalid-url');
        expect(resolveDataSourceLogTarget('not a url')).toBe('invalid-url');
        expect(resolveDataSourceLogTarget('')).toBe('invalid-url');
    });

    it('toDataSourceLogError: только name и statusCode, без message/request/response', () => {
        const error = Object.assign(new Error(`request to /users/${SECRET} failed`), {
            name: 'FetchError',
            statusCode: 404,
            request: `/users/${SECRET}`,
            response: { status: 404, _data: { token: SECRET } },
        });

        const logged = toDataSourceLogError(error);

        expect(logged).toEqual({ name: 'FetchError', statusCode: 404 });
        expect(JSON.stringify(logged)).not.toContain(SECRET);
    });

    it('toDataSourceLogError: статус из response.status и не-Error значения', () => {
        expect(toDataSourceLogError({ response: { status: 502 } })).toEqual({
            name: 'object',
            statusCode: 502,
        });
        expect(toDataSourceLogError(SECRET)).toEqual({ name: 'string' });
        expect(toDataSourceLogError(undefined)).toEqual({ name: 'undefined' });
    });
});

describe('useBricksDataSources: redaction production-логов', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        dataSourceFetcherMock.mockReset();
    });

    it('fetch failed: в prod-payload нет URL с параметрами и сырой ошибки', async () => {
        dataSourceFetcherMock.mockRejectedValue(
            Object.assign(new Error(`GET https://api.example.com/users/${SECRET}: 404`), {
                name: 'FetchError',
                statusCode: 404,
                request: `https://api.example.com/users/${SECRET}?token=${SECRET}`,
                response: { status: 404, _data: { secret: SECRET } },
                options: { headers: { authorization: SECRET } },
            })
        );
        const { executeDataSource } = useBricksDataSources();

        const result = await executeDataSource(
            createSource({
                url: 'https://api.example.com/users/:userId',
                params: {
                    userId: { from: 'component.userId' },
                },
            }),
            createComponent({ userId: SECRET }),
            null
        );

        expect(result).toBeNull();
        expect(errorSpy).toHaveBeenCalledTimes(1);

        const serialized = stringifyCalls(errorSpy);
        expect(serialized).not.toContain(SECRET);
        expect(serialized).toContain('https://api.example.com');
        expect(serialized).toContain('FetchError');
        expect(serialized).toContain('404');
    });

    it('policy skip: prod-payload содержит только origin запрещённого хоста', async () => {
        const { executeDataSource } = useBricksDataSources();

        const result = await executeDataSource(
            createSource({ url: `https://evil.example/exfil/${SECRET}?q=${SECRET}` }),
            createComponent(),
            null
        );

        expect(result).toBeNull();
        expect(dataSourceFetcherMock).not.toHaveBeenCalled();

        const serialized = stringifyCalls(warnSpy);
        expect(serialized).not.toContain(SECRET);
        expect(serialized).toContain('https://evil.example');
    });

    it('unresolved params skip: prod-payload не содержит частично резолвленный URL', async () => {
        const { executeDataSource } = useBricksDataSources();

        const result = await executeDataSource(
            createSource({
                url: `/api/items/${SECRET}/:missing`,
                params: {},
            }),
            createComponent(),
            null
        );

        expect(result).toBeNull();
        expect(dataSourceFetcherMock).not.toHaveBeenCalled();

        const serialized = stringifyCalls(warnSpy);
        expect(serialized).not.toContain(SECRET);
        expect(serialized).toContain('local');
    });
});
