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
 * Смена СВОЕГО пароля. Отличие от админской ручки — обязательный текущий пароль:
 * без него украденная кука сменила бы пароль сама и заперла владельца снаружи.
 *
 * Хеш пароля здесь настоящий (scrypt не заглушен): подмени verify заглушкой — и
 * спека перестала бы отличать «пароль проверен» от «проверка вызвана».
 */

// #region Mocks
const { runtimeConfig, authAdapterMock, bodyMock, clearSessionCookieMock } = vi.hoisted(() => ({
    runtimeConfig: {
        bricksAuthMode: 'database',
        bricksAuthAllowPasswordChange: true,
    } as Record<string, unknown>,
    authAdapterMock: {
        getUserByUsername: vi.fn(),
        updateOwnPassword: vi.fn(),
    },
    bodyMock: { value: {} as Record<string, unknown> },
    clearSessionCookieMock: vi.fn(),
}));

vi.mock('nitropack/runtime', () => ({
    useRuntimeConfig: () => runtimeConfig,
}));

vi.mock('../../src/runtime/modules/persistence/server/registry', () => ({
    useBricksAuthAdapter: () => authAdapterMock,
}));

vi.mock(
    '../../src/runtime/modules/persistence/server/utils/handlerHelpers',
    async (importOriginal) => ({
        ...(await importOriginal<Record<string, unknown>>()),
        readNormalizedBody: async () => bodyMock.value,
    })
);

vi.mock('../../src/runtime/server/utils/auth/sessionCookie', () => ({
    clearSessionCookie: clearSessionCookieMock,
}));

const changeOwnPassword = (
    await import('../../src/runtime/server/api/bricks/users/me/password.post')
).default;
const { hashPassword, verifyPassword } =
    await import('../../src/runtime/server/utils/auth/passwords');
const { BRICKS_API_ERROR_CODES } =
    await import('../../src/runtime/modules/common/constants/apiErrors');
// #endregion

// #region Fixtures
/** Пароль учётки в тестах и его настоящий scrypt-хеш. */
const CURRENT_PASSWORD = 'current-password';
const CURRENT_PASSWORD_HASH = await hashPassword(CURRENT_PASSWORD);

/** Учётка сессии: по её id и логину ручка находит цель правки. */
const SESSION_USER = {
    id: 7,
    username: 'ivan',
    isActive: true,
    role: 'editor' as const,
    authVersion: 4,
    displayName: null,
    avatarUrl: null,
};

/**
 * Событие запроса от пользователя сессии.
 *
 * @returns Событие h3 в минимальной форме.
 */
function createEvent(): H3Event {
    return createFakeH3Event({
        path: '/api/bricks/users/me/password',
        method: 'POST',
        context: { bricksUser: SESSION_USER },
    });
}

/**
 * Выполняет ручку и возвращает брошенную ей ошибку.
 *
 * @returns Пойманная ошибка.
 */
async function catchThrown(): Promise<IThrownHttpError> {
    try {
        await changeOwnPassword(createEvent());
    } catch (error: unknown) {
        return error as IThrownHttpError;
    }

    throw new Error('Expected handler to throw');
}
// #endregion

beforeEach(() => {
    vi.clearAllMocks();
    runtimeConfig.bricksAuthMode = 'database';
    runtimeConfig.bricksAuthAllowPasswordChange = true;
});

describe('POST /users/me/password: смена своего пароля', () => {
    beforeEach(() => {
        bodyMock.value = {
            currentPassword: CURRENT_PASSWORD,
            newPassword: 'brand-new-password',
        };
        authAdapterMock.getUserByUsername.mockResolvedValue({
            id: 7,
            username: 'ivan',
            passwordHash: CURRENT_PASSWORD_HASH,
            isActive: true,
            role: 'editor',
            authVersion: 4,
        });
    });

    it('пишет новый пароль условно по поколению и чистит cookie', async () => {
        // Условие обязательно: проверка текущего пароля идёт секунды, и за это
        // время администратор мог сбросить пароль этой учётке
        authAdapterMock.updateOwnPassword.mockResolvedValue(true);

        const response = await changeOwnPassword(createEvent());

        // Поколение берётся из СЕССИИ, а не из свежего чтения учётки
        expect(authAdapterMock.updateOwnPassword).toHaveBeenCalledWith(7, {
            passwordHash: expect.stringMatching(/^scrypt:/),
            expectedAuthVersion: SESSION_USER.authVersion,
        });
        expect(clearSessionCookieMock).toHaveBeenCalled();
        expect(response).toEqual({ success: true });
    });

    it('хеширует именно новый пароль, а не переносит старый хеш', async () => {
        authAdapterMock.updateOwnPassword.mockResolvedValue(true);

        await changeOwnPassword(createEvent());

        const { passwordHash } = authAdapterMock.updateOwnPassword.mock.calls[0][1];

        expect(await verifyPassword('brand-new-password', passwordHash)).toBe(true);
        expect(await verifyPassword(CURRENT_PASSWORD, passwordHash)).toBe(false);
    });

    it('отклоняет неверный текущий пароль до всякой записи', async () => {
        bodyMock.value = { currentPassword: 'wrong-password', newPassword: 'brand-new-password' };

        const error = await catchThrown();

        expect(error.statusCode).toBe(400);
        expect(error.data?.code).toBe(BRICKS_API_ERROR_CODES.invalidCurrentPassword);
        expect(authAdapterMock.updateOwnPassword).not.toHaveBeenCalled();
        expect(clearSessionCookieMock).not.toHaveBeenCalled();
    });

    it('отвечает 401, если поколение сдвинулось за время проверки', async () => {
        // Пароль сбросил администратор либо учётку отключили: сессия уже мертва,
        // и клиент уйдёт на форму логина
        authAdapterMock.updateOwnPassword.mockResolvedValue(false);

        expect((await catchThrown()).statusCode).toBe(401);
    });

    it('отказывает, если поколение учётки сдвинулось после проверки сессии', async () => {
        // Смена роли поднимает поколение и отзывает сессии, но пароль не меняет —
        // значит прежний подходит. Считай ручка условие по СВЕЖЕ прочитанному
        // поколению, и запись прошла бы из уже отозванной сессии
        authAdapterMock.getUserByUsername.mockResolvedValue({
            id: 7,
            username: 'ivan',
            passwordHash: CURRENT_PASSWORD_HASH,
            isActive: true,
            role: 'viewer',
            authVersion: 5,
        });

        expect((await catchThrown()).statusCode).toBe(401);
        expect(authAdapterMock.updateOwnPassword).not.toHaveBeenCalled();
    });

    it('не трогает учётку, если сессия относится к другой строке', async () => {
        // Логин неизменяем, но учётку могли удалить и создать заново с тем же
        // логином: правка ушла бы чужому человеку
        authAdapterMock.getUserByUsername.mockResolvedValue({
            id: 42,
            username: 'ivan',
            passwordHash: CURRENT_PASSWORD_HASH,
            isActive: true,
            role: 'editor',
            authVersion: 1,
        });

        expect((await catchThrown()).statusCode).toBe(401);
        expect(authAdapterMock.updateOwnPassword).not.toHaveBeenCalled();
    });

    it('при выключенном флаге отвечает 403 и не читает учётку', async () => {
        runtimeConfig.bricksAuthAllowPasswordChange = false;

        const error = await catchThrown();

        expect(error.statusCode).toBe(403);
        expect(error.data?.code).toBe(BRICKS_API_ERROR_CODES.passwordChangeDisabled);
        expect(authAdapterMock.getUserByUsername).not.toHaveBeenCalled();
    });
});
