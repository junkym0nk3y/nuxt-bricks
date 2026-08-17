// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Types
import type { H3Event } from 'h3';

// Utils
import { createFakeH3Event } from '../helpers/h3Events';
// #endregion

// #region Mocks
/**
 * Конфигурация запроса, которую подменяет тест. `userManagement.ts` читает её
 * через `useRuntimeConfig(event)`; реальный `nitropack/runtime` вне Nuxt-сборки
 * резолвит виртуальные модули и падает при импорте (паттерн
 * test/server/authCsrfProtection.spec.ts).
 */
const runtimeConfig: Record<string, unknown> = { bricksAuthMode: 'database' };

vi.mock('nitropack/runtime', () => ({
    useRuntimeConfig: () => runtimeConfig,
}));

const {
    assertNotSelfTarget,
    assertUserManagementAvailable,
    buildCreateUserPayload,
    validateUpdateUserPayload,
} = await import('../../src/runtime/server/utils/auth/userManagement');
const { verifyPassword } = await import('../../src/runtime/server/utils/auth/passwords');
const { BRICKS_API_ERROR_CODES } =
    await import('../../src/runtime/modules/common/constants/apiErrors');
// #endregion

/**
 * Событие запроса от пользователя сессии: из него читаются только runtimeConfig
 * (замокан) и `context.bricksUser`, которого ставит auth-middleware.
 *
 * @param userId - Идентификатор пользователя сессии.
 * @returns Событие h3 в минимальной форме.
 */
function createEvent(userId: number): H3Event {
    return createFakeH3Event({ context: { bricksUser: { id: userId } } });
}

describe('userManagement: доступность раздела учёток', () => {
    it('отвечает 404 вне database-режима: учёток в basic нет вовсе', () => {
        runtimeConfig.bricksAuthMode = 'basic';

        expect(() => assertUserManagementAvailable(createEvent(1))).toThrowError(
            expect.objectContaining({ statusCode: 404 })
        );
    });

    it('отвечает 404 при выключенном флаге — 403 подтверждал бы, что раздел есть', () => {
        runtimeConfig.bricksAuthMode = 'database';
        runtimeConfig.bricksAuthAllowUserManagement = false;

        expect(() => assertUserManagementAvailable(createEvent(1))).toThrowError(
            expect.objectContaining({ statusCode: 404 })
        );
    });

    it('распознаёт строку «false» из env: без этого NUXT_-переопределение не работало бы', () => {
        runtimeConfig.bricksAuthAllowUserManagement = 'false';

        expect(() => assertUserManagementAvailable(createEvent(1))).toThrowError(
            expect.objectContaining({ statusCode: 404 })
        );
    });

    it('открыт при database-режиме и незаданном флаге (дефолт — включено)', () => {
        runtimeConfig.bricksAuthAllowUserManagement = undefined;

        expect(() => assertUserManagementAvailable(createEvent(1))).not.toThrow();
    });
});

describe('userManagement: запрет операций над собой', () => {
    it('отклоняет свою учётку с машиночитаемым кодом — свой пароль меняется ручкой профиля', () => {
        // Админ-ручка пароля не спрашивает текущий пароль: разреши её для себя,
        // и требование «текущий пароль обязателен» обходится в один запрос
        expect(() => assertNotSelfTarget(createEvent(7), 7)).toThrowError(
            expect.objectContaining({
                statusCode: 409,
                data: { code: BRICKS_API_ERROR_CODES.selfTargetForbidden },
            })
        );
    });

    it('пропускает чужую учётку', () => {
        expect(() => assertNotSelfTarget(createEvent(7), 8)).not.toThrow();
    });
});

describe('userManagement: валидация DTO', () => {
    it('канонизирует логин в нижний регистр — уникальность держится индексом по lower(username)', async () => {
        const payload = await buildCreateUserPayload({
            username: '  Ivan.Petrov  ',
            password: 'sufficient-password',
            role: 'editor',
        });

        expect(payload.username).toBe('ivan.petrov');
    });

    it('не обрезает пробелы пароля: обрезанный пароль не подошёл бы при входе', async () => {
        const password = '  spaced pass  ';
        const payload = await buildCreateUserPayload({
            username: 'spacey',
            password,
            role: 'viewer',
        });

        expect(await verifyPassword(password, payload.passwordHash)).toBe(true);
        expect(await verifyPassword(password.trim(), payload.passwordHash)).toBe(false);
    });

    it('отклоняет логин с недопустимыми символами и слишком короткий пароль', async () => {
        await expect(
            buildCreateUserPayload({
                username: 'ivan petrov',
                password: 'sufficient-password',
                role: 'editor',
            })
        ).rejects.toThrowError(expect.objectContaining({ statusCode: 400 }));

        await expect(
            buildCreateUserPayload({ username: 'ivan', password: 'short', role: 'editor' })
        ).rejects.toThrowError(expect.objectContaining({ statusCode: 400 }));
    });

    it('требует хотя бы одно поле в правке и отклоняет неизвестные ключи', () => {
        expect(validateUpdateUserPayload({ role: 'viewer' })).toEqual({
            role: 'viewer',
            isActive: undefined,
        });

        expect(() => validateUpdateUserPayload({})).toThrowError(
            expect.objectContaining({ statusCode: 400 })
        );
        // Имя и фото профиля правит себе сам человек — админ-ручка их не принимает
        expect(() => validateUpdateUserPayload({ displayName: 'Иван' })).toThrowError(
            expect.objectContaining({ statusCode: 400 })
        );
        expect(() => validateUpdateUserPayload({ role: 'owner' })).toThrowError(
            expect.objectContaining({ statusCode: 400 })
        );
    });
});
