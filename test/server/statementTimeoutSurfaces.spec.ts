// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Types
import type { H3Event } from 'h3';
import type { IThrownHttpError } from '../helpers/types';
// #endregion

/**
 * Остановка запроса серверным лимитом времени должна доходить наружу как 504 с
 * машиночитаемым кодом даже там, где общий `catch` подменяет статус своим:
 * middleware авторизации отвечает 503 на любую ошибку хранилища сессий,
 * media-прокси — 500. Прочие ошибки на этих путях обязаны сохранить прежний
 * статус, иначе правка меняет поведение шире заявленного.
 */

// #region Mocks
const { resolveSessionUserMock, runtimeConfigMock, getMediaByUrlMock, readJsonBodyMock } =
    vi.hoisted(() => ({
        resolveSessionUserMock: vi.fn(),
        runtimeConfigMock: vi.fn(),
        getMediaByUrlMock: vi.fn(),
        readJsonBodyMock: vi.fn(),
    }));

vi.mock('nitropack/runtime', () => ({
    useRuntimeConfig: runtimeConfigMock,
}));

vi.mock('../../src/runtime/server/utils/auth/session', () => ({
    resolveSessionUser: resolveSessionUserMock,
}));

vi.mock('../../src/runtime/modules/persistence/server/defaultStorage', () => ({
    getBricksDefaultStorageFactory: () => undefined,
}));

vi.mock('../../src/runtime/modules/persistence/server/registry', () => ({
    useBricksAuthAdapter: () => ({}),
    useBricksStorageAdapter: () => ({ getMediaByUrl: getMediaByUrlMock }),
    useBricksPublishAdapter: () => ({}),
}));

vi.mock('../../src/runtime/modules/persistence/server/utils/requestBodyLimits', () => ({
    readJsonBodyWithLimit: readJsonBodyMock,
    collectWebStreamWithLimit: vi.fn(),
}));

import authMiddleware from '../../src/runtime/server/middleware/auth';
import mediaProxyHandler from '../../src/runtime/server/api/bricks/media/s3-proxy.post';
import { BricksStatementTimeoutError } from '../../src/runtime/modules/persistence/server/utils/storageErrors';
import { BRICKS_API_ERROR_CODES } from '../../src/runtime/modules/common/constants/apiErrors';
// #endregion

/**
 * Событие защищённого GET-запроса к editorial API (минимум, который читает
 * middleware: url, метод и заголовки).
 *
 * @returns Фейковое событие h3.
 */
function makeProtectedEvent(): H3Event {
    return {
        node: {
            req: { url: '/api/bricks/', method: 'GET', headers: {} },
            res: { setHeader: vi.fn() },
        },
        context: {},
    } as unknown as H3Event;
}

/**
 * Выполняет обработчик и возвращает брошенную им ошибку.
 *
 * @param run - Вызов обработчика.
 * @returns Пойманная ошибка.
 */
async function catchThrown(run: () => Promise<unknown>): Promise<IThrownHttpError> {
    try {
        await run();
    } catch (error: unknown) {
        return error as IThrownHttpError;
    }

    throw new Error('Expected handler to throw');
}

describe('серверный лимит времени доходит наружу через чужие catch-пути', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        runtimeConfigMock.mockReturnValue({
            bricksAuthMode: 'database',
            bricksDatabaseUrl: 'postgresql://localhost:5432/bricks',
            public: {},
            app: {},
        });
    });

    it('проверка сессии: лимит даёт 504 с кодом, прочие отказы — прежние 503', async () => {
        // Сессия читается перед КАЖДЫМ защищённым запросом, поэтому подмена
        // статуса здесь накрыла бы весь editorial API
        resolveSessionUserMock.mockRejectedValueOnce(new BricksStatementTimeoutError());

        const cancelled = await catchThrown(() => authMiddleware(makeProtectedEvent()));

        expect(cancelled.statusCode).toBe(504);
        expect(cancelled.data?.code).toBe(BRICKS_API_ERROR_CODES.statementTimeout);

        resolveSessionUserMock.mockRejectedValueOnce(new Error('connection refused'));

        const unavailable = await catchThrown(() => authMiddleware(makeProtectedEvent()));

        expect(unavailable.statusCode).toBe(503);
        expect(unavailable.data?.code).toBeUndefined();
    });

    it('media-прокси: лимит даёт 504 с кодом, прочие отказы — прежние 500', async () => {
        // Поиск медиа по URL идёт в БД до обращения к S3
        resolveSessionUserMock.mockResolvedValue({
            user: { id: 1 },
            expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        });
        readJsonBodyMock.mockResolvedValue({
            url: 'https://storage.example.com/bricks-media/a.webp',
        });
        getMediaByUrlMock.mockRejectedValueOnce(new BricksStatementTimeoutError());

        const cancelled = await catchThrown(() => mediaProxyHandler(makeProtectedEvent()));

        expect(cancelled.statusCode).toBe(504);
        expect(cancelled.data?.code).toBe(BRICKS_API_ERROR_CODES.statementTimeout);

        getMediaByUrlMock.mockRejectedValueOnce(new Error('connection refused'));

        const failed = await catchThrown(() => mediaProxyHandler(makeProtectedEvent()));

        expect(failed.statusCode).toBe(500);
        expect(failed.data?.code).toBeUndefined();
    });
});
