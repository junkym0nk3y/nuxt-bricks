// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Types
import type { H3Event } from 'h3';
import type { TBricksUserRole } from '../../src/runtime/modules/common/types/auth';

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
    assertAdminRole,
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

/**
 * Событие запроса от пользователя известной роли.
 *
 * @param role - Роль сессии.
 * @returns Событие h3 в минимальной форме.
 */
function createRoleEvent(role: TBricksUserRole): H3Event {
    return createFakeH3Event({ context: { bricksUser: { id: 1, role } } });
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

    it('не выключается пустой строкой: так выглядит объявленная без значения env', () => {
        // Build-time нормализацию этот путь минует: собранное приложение получает
        // `NUXT_BRICKS_AUTH_ALLOW_USER_MANAGEMENT=` от Nitro как есть
        runtimeConfig.bricksAuthAllowUserManagement = '';

        expect(() => assertUserManagementAvailable(createEvent(1))).not.toThrow();
    });
});

describe('userManagement: требование роли администратора внутри ручки', () => {
    it('отклоняет наблюдателя и редактора, добравшихся до админской ручки', () => {
        // Проверка не декоративная: `/api/bricks/users/me` матчится тем же
        // параметрическим маршрутом, что и правка чужой учётки, поэтому послабление
        // для поддерева профиля не должно оставлять единственной преградой
        // нечисловой `:id`
        for (const role of ['viewer', 'editor'] as const) {
            expect(() => assertAdminRole(createRoleEvent(role)), role).toThrowError(
                expect.objectContaining({
                    statusCode: 403,
                    data: { code: BRICKS_API_ERROR_CODES.insufficientRole },
                })
            );
        }
    });

    it('отклоняет запрос без пользователя в контексте', () => {
        // Ручка, зарегистрированная мимо матрицы путей middleware, получила бы
        // событие без `bricksUser` — «роли нет» означает отказ, а не пропуск
        expect(() => assertAdminRole(createFakeH3Event({}))).toThrowError(
            expect.objectContaining({ statusCode: 403 })
        );
    });

    it('пропускает администратора', () => {
        expect(() => assertAdminRole(createRoleEvent('admin'))).not.toThrow();
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

    it('без имени и активности учётка активна и показывается логином', async () => {
        const payload = await buildCreateUserPayload({
            username: 'ivan',
            password: 'sufficient-password',
            role: 'editor',
        });

        // Разрешает их ручка, а не адаптер: `undefined` уехал бы в INSERT как
        // NULL, а `is_active` объявлен NOT NULL — дефолт таблицы при явном
        // значении не применяется вовсе
        expect(payload.displayName).toBeNull();
        expect(payload.isActive).toBe(true);
    });

    it('принимает отображаемое имя и выключенный вход при создании', async () => {
        const payload = await buildCreateUserPayload({
            username: 'anna.editor',
            password: 'sufficient-password',
            role: 'editor',
            displayName: '  Анна Ким  ',
            isActive: false,
        });

        expect(payload.displayName).toBe('Анна Ким');
        expect(payload.isActive).toBe(false);
    });

    it('пустое имя равно его отсутствию: просьба показывать логин', async () => {
        const payload = await buildCreateUserPayload({
            username: 'ivan',
            password: 'sufficient-password',
            role: 'editor',
            displayName: '   ',
        });

        expect(payload.displayName).toBeNull();
    });

    it('отклоняет имя с управляющим символом и неизвестные ключи создания', async () => {
        // Перенос строки внутри имени сломал бы строку списка и меню профиля
        await expect(
            buildCreateUserPayload({
                username: 'ivan',
                password: 'sufficient-password',
                role: 'editor',
                displayName: 'Иван\nПетров',
            })
        ).rejects.toThrowError(expect.objectContaining({ statusCode: 400 }));

        await expect(
            buildCreateUserPayload({
                username: 'ivan',
                password: 'sufficient-password',
                role: 'editor',
                avatarUrl: 'https://example.test/photo.webp',
            })
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
