// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Types
import type { H3Event } from 'h3';
import type { TBricksUserRole } from '../../src/runtime/modules/common/types/auth';
import type { IThrownHttpError } from '../helpers/types';

// Utils
import { createFakeH3Event } from '../helpers/h3Events';
// #endregion

/**
 * Ручки с параметром `:id` требуют роль сами, не полагаясь на матрицу путей
 * middleware. Дубль намеренный: этим же маршрутом матчится `/api/bricks/users/me`,
 * и стоит поддереву профиля получить послабление, как единственной преградой
 * останется разбор `:id` — совпадение, а не право доступа. Спека сторожит именно
 * ВЫЗОВ гарда в каждой ручке: сам `assertAdminRole` проверяется отдельно
 * (test/server/authUserManagement.spec.ts), но его пропажу из ручки поймать
 * нечем — middleware в проде запрос всё равно остановит.
 */

// #region Mocks
const { runtimeConfig, authAdapterMock } = vi.hoisted(() => ({
    runtimeConfig: {
        bricksAuthMode: 'database',
        bricksAuthAllowUserManagement: true,
    } as Record<string, unknown>,
    authAdapterMock: {
        updateUserState: vi.fn(),
        updateUserPassword: vi.fn(),
        deleteUser: vi.fn(),
    },
}));

vi.mock('nitropack/runtime', () => ({
    useRuntimeConfig: () => runtimeConfig,
}));

vi.mock('../../src/runtime/modules/persistence/server/registry', () => ({
    useBricksAuthAdapter: () => authAdapterMock,
}));

const patchUser = (await import('../../src/runtime/server/api/bricks/users/[id].patch')).default;
const deleteUser = (await import('../../src/runtime/server/api/bricks/users/[id].delete')).default;
const setUserPassword = (
    await import('../../src/runtime/server/api/bricks/users/[id]/password.post')
).default;
const { BRICKS_API_ERROR_CODES } =
    await import('../../src/runtime/modules/common/constants/apiErrors');
// #endregion

/** Ручки раздела, каждая из которых обязана требовать роль сама. */
const GUARDED_HANDLERS = [
    { name: 'PATCH /users/:id', handler: patchUser },
    { name: 'DELETE /users/:id', handler: deleteUser },
    { name: 'POST /users/:id/password', handler: setUserPassword },
];

/**
 * Событие запроса от пользователя заданной роли к маршруту `users/me` — тому
 * самому пути, который матчится параметрической ручкой.
 *
 * @param role - Роль сессии.
 * @returns Событие h3 в минимальной форме.
 */
function createEvent(role: TBricksUserRole): H3Event {
    return createFakeH3Event({
        path: '/api/bricks/users/me',
        method: 'PATCH',
        context: { bricksUser: { id: 1, username: 'someone', isActive: true, role } },
    });
}

/**
 * Выполняет ручку и возвращает брошенную ей ошибку.
 *
 * @param handler - Обработчик маршрута.
 * @param role - Роль сессии.
 * @returns Пойманная ошибка.
 */
async function catchThrown(
    handler: (event: H3Event) => unknown,
    role: TBricksUserRole
): Promise<IThrownHttpError> {
    try {
        await handler(createEvent(role));
    } catch (error: unknown) {
        return error as IThrownHttpError;
    }

    throw new Error('Expected handler to throw');
}

describe('ручки учёток с :id: собственное требование роли', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        runtimeConfig.bricksAuthMode = 'database';
        runtimeConfig.bricksAuthAllowUserManagement = true;
    });

    it('отказывает наблюдателю и редактору, не трогая адаптер', async () => {
        for (const route of GUARDED_HANDLERS) {
            for (const role of ['viewer', 'editor'] as const) {
                const error = await catchThrown(route.handler, role);

                expect(error.statusCode, `${route.name} / ${role}`).toBe(403);
                expect(error.data?.code, `${route.name} / ${role}`).toBe(
                    BRICKS_API_ERROR_CODES.insufficientRole
                );
            }
        }

        // Отказ идёт до всякой работы: ни чтения тела, ни похода в хранилище
        expect(authAdapterMock.updateUserState).not.toHaveBeenCalled();
        expect(authAdapterMock.updateUserPassword).not.toHaveBeenCalled();
        expect(authAdapterMock.deleteUser).not.toHaveBeenCalled();
    });

    it('администратора пропускает дальше — до разбора `:id`', async () => {
        // 400 от `requireNumericId` здесь и есть доказательство, что ролевой гард
        // пройден: `me` не число, и дальше ручка не идёт
        for (const route of GUARDED_HANDLERS) {
            const error = await catchThrown(route.handler, 'admin');

            expect(error.statusCode, route.name).toBe(400);
        }
    });

    it('выключённый раздел отвечает 404 раньше ролевого гарда', async () => {
        // Порядок важен: 403 подтверждал бы, что маршрут в сборке есть
        runtimeConfig.bricksAuthAllowUserManagement = false;

        for (const route of GUARDED_HANDLERS) {
            const error = await catchThrown(route.handler, 'viewer');

            expect(error.statusCode, route.name).toBe(404);
        }
    });
});
