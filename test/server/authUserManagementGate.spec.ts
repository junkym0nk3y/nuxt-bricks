// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Types
import type { H3Event } from 'h3';
import type { IThrownHttpError } from '../helpers/types';

// Utils
import { createFakeH3Event } from '../helpers/h3Events';
// #endregion

/**
 * Выключенный раздел учёток обещан наружу как отсутствующий маршрут (404). Обещание
 * держится только если гейт стоит РАНЬШЕ проверки роли и CSRF: иначе редактор
 * получает 403, аноним — 401, а кросс-сайтовый POST — CSRF-403, и каждый из этих
 * ответов подтверждает, что маршрут есть и просто закрыт.
 */

// #region Mocks
const { resolveSessionUserMock, runtimeConfigMock } = vi.hoisted(() => ({
    resolveSessionUserMock: vi.fn(),
    runtimeConfigMock: vi.fn(),
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
    useBricksStorageAdapter: () => ({}),
    useBricksPublishAdapter: () => ({}),
}));

import authMiddleware from '../../src/runtime/server/middleware/auth';
import { BRICKS_API_ERROR_CODES } from '../../src/runtime/modules/common/constants/apiErrors';
// #endregion

/** Все пять маршрутов раздела учёток вместе с их методами. */
const USER_MANAGEMENT_ROUTES = [
    { url: '/api/bricks/users', method: 'GET' },
    { url: '/api/bricks/users', method: 'POST' },
    { url: '/api/bricks/users/5', method: 'PATCH' },
    { url: '/api/bricks/users/5', method: 'DELETE' },
    { url: '/api/bricks/users/5/password', method: 'POST' },
];

/**
 * Событие запроса к маршруту раздела учёток.
 *
 * @param path - Путь запроса.
 * @param method - HTTP-метод.
 * @param headers - Заголовки (для CSRF-гейта unsafe-методов).
 * @returns Событие h3 в минимальной форме.
 */
function makeEvent(path: string, method: string, headers: Record<string, string> = {}): H3Event {
    return createFakeH3Event({ path, method, headers });
}

/**
 * Выполняет middleware и возвращает брошенную им ошибку.
 *
 * @param event - Событие запроса.
 * @returns Пойманная ошибка.
 */
async function catchThrown(event: H3Event): Promise<IThrownHttpError> {
    try {
        await authMiddleware(event);
    } catch (error: unknown) {
        return error as IThrownHttpError;
    }

    throw new Error('Expected middleware to throw');
}

describe('гейт раздела учёток в auth-middleware', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        runtimeConfigMock.mockReturnValue({
            bricksAuthMode: 'database',
            bricksDatabaseUrl: 'postgresql://localhost:5432/bricks',
            bricksAuthAllowUserManagement: false,
            public: {},
            app: {},
        });
    });

    it('отвечает 404 на все маршруты раздела при выключенном флаге — независимо от роли и метода', async () => {
        // Роль редактора: без гейта до проверки прав она получила бы 403 и тем
        // самым подтвердила, что маршрут существует
        resolveSessionUserMock.mockResolvedValue({
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            user: { id: 1, username: 'editor', isActive: true, role: 'editor' },
        });

        for (const route of USER_MANAGEMENT_ROUTES) {
            const error = await catchThrown(
                makeEvent(route.url, route.method, { 'x-bricks-csrf': '1' })
            );

            expect(error.statusCode, `${route.method} ${route.url}`).toBe(404);
            expect(error.data?.code, `${route.method} ${route.url}`).toBeUndefined();
        }
    });

    it('отвечает 404 и без сессии, и кросс-сайтовому запросу без CSRF-заголовка', async () => {
        // Гейт стоит раньше и авторизации, и CSRF: 401 и CSRF-403 так же
        // раскрывали бы наличие маршрута
        resolveSessionUserMock.mockResolvedValue(null);

        const anonymous = await catchThrown(makeEvent('/api/bricks/users', 'GET'));
        expect(anonymous.statusCode).toBe(404);

        const crossSite = await catchThrown(
            makeEvent('/api/bricks/users', 'POST', { origin: 'https://evil.example' })
        );
        expect(crossSite.statusCode).toBe(404);
    });

    it('не трогает раздел при включённом флаге: роли решает матрица прав', async () => {
        runtimeConfigMock.mockReturnValue({
            bricksAuthMode: 'database',
            bricksDatabaseUrl: 'postgresql://localhost:5432/bricks',
            bricksAuthAllowUserManagement: true,
            public: {},
            app: {},
        });
        resolveSessionUserMock.mockResolvedValue({
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            user: { id: 1, username: 'editor', isActive: true, role: 'editor' },
        });

        const error = await catchThrown(makeEvent('/api/bricks/users', 'GET'));

        expect(error.statusCode).toBe(403);
        expect(error.data?.code).toBe(BRICKS_API_ERROR_CODES.insufficientRole);
    });

    it('оставляет собственный профиль вне гейта: он от флага раздела не зависит', async () => {
        // `/users/me` живёт своими правами («любая валидная сессия»), и выключенный
        // раздел управления чужими учётками не должен уносить свой профиль
        resolveSessionUserMock.mockResolvedValue({
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            user: { id: 1, username: 'viewer', isActive: true, role: 'viewer' },
        });

        await expect(
            authMiddleware(makeEvent('/api/bricks/users/me', 'PATCH', { 'x-bricks-csrf': '1' }))
        ).resolves.toBeUndefined();
    });
});
