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
    requirePassword,
    validateCreateUserInput,
    validateUpdateUserPayload,
} = await import('../../src/runtime/server/utils/auth/userManagement');
const { verifyPassword } = await import('../../src/runtime/server/utils/auth/passwords');
const { BRICKS_API_ERROR_CODES } =
    await import('../../src/runtime/modules/common/constants/apiErrors');
const { BRICKS_DEFAULT_ADMIN_PASSWORD } =
    await import('../../src/runtime/modules/common/constants/auth');
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
    it('канонизирует логин в нижний регистр — уникальность держится индексом по lower(username)', () => {
        const input = validateCreateUserInput({
            username: '  Ivan.Petrov  ',
            password: 'sufficient-password',
            role: 'editor',
        });

        expect(input.username).toBe('ivan.petrov');
    });

    it('не обрезает пробелы пароля: обрезанный пароль не подошёл бы при входе', async () => {
        const password = '  spaced pass  ';
        const payload = await buildCreateUserPayload(
            validateCreateUserInput({
                username: 'spacey',
                password,
                role: 'viewer',
            })
        );

        expect(await verifyPassword(password, payload.passwordHash)).toBe(true);
        expect(await verifyPassword(password.trim(), payload.passwordHash)).toBe(false);
    });

    // Пароль сида одинаков во всех установках и напечатан в README. Задай его
    // администратор другому человеку — учётка была бы общеизвестной, а
    // предупреждение о дефолтном пароле на неё не сработало бы: оно узнаёт
    // только сидовый хеш, а у заново заданного пароля своя соль. Тем же запретом
    // закрыта «смена» своего пароля на тот же самый ради гашения полосы.
    it('отклоняет дефолтный пароль сида на всех путях установки пароля', () => {
        expect(() =>
            validateCreateUserInput({
                username: 'ivan',
                password: BRICKS_DEFAULT_ADMIN_PASSWORD,
                role: 'editor',
            })
        ).toThrowError(expect.objectContaining({ statusCode: 400 }));

        // Тот же путь используют админская ручка чужого пароля и вкладка своего:
        // границы нового пароля у них общие
        expect(() => requirePassword(BRICKS_DEFAULT_ADMIN_PASSWORD, 'newPassword')).toThrowError(
            expect.objectContaining({ statusCode: 400 })
        );
        expect(requirePassword(`${BRICKS_DEFAULT_ADMIN_PASSWORD}-own`)).toBe(
            `${BRICKS_DEFAULT_ADMIN_PASSWORD}-own`
        );
    });

    it('отклоняет логин с недопустимыми символами и слишком короткий пароль', () => {
        expect(() =>
            validateCreateUserInput({
                username: 'ivan petrov',
                password: 'sufficient-password',
                role: 'editor',
            })
        ).toThrowError(expect.objectContaining({ statusCode: 400 }));

        expect(() =>
            validateCreateUserInput({ username: 'ivan', password: 'short', role: 'editor' })
        ).toThrowError(expect.objectContaining({ statusCode: 400 }));
    });

    // Предел логина задан продуктом, а не колонкой (VARCHAR(255)): строка списка
    // показывает логин целиком и не обрезает его, потому что по нему входят и по
    // нему учётку находят. Числа здесь намеренно записаны литералами: взятые из
    // той же константы, они повторили бы реализацию и не заметили бы её правку
    it('принимает логин из 14 символов и отклоняет 15', () => {
        const input = validateCreateUserInput({
            username: 'a'.repeat(14),
            password: 'sufficient-password',
            role: 'editor',
        });

        expect(input.username).toBe('a'.repeat(14));

        expect(() =>
            validateCreateUserInput({
                username: 'a'.repeat(15),
                password: 'sufficient-password',
                role: 'editor',
            })
        ).toThrowError(expect.objectContaining({ statusCode: 400 }));
    });

    it('без имени и активности учётка активна и показывается логином', () => {
        const input = validateCreateUserInput({
            username: 'ivan',
            password: 'sufficient-password',
            role: 'editor',
        });

        // Разрешает их ручка, а не адаптер: `undefined` уехал бы в INSERT как
        // NULL, а `is_active` объявлен NOT NULL — дефолт таблицы при явном
        // значении не применяется вовсе
        expect(input.displayName).toBeNull();
        expect(input.isActive).toBe(true);
    });

    it('принимает отображаемое имя и выключенный вход при создании', () => {
        const input = validateCreateUserInput({
            username: 'anna.editor',
            password: 'sufficient-password',
            role: 'editor',
            displayName: '  Анна Ким  ',
            isActive: false,
        });

        expect(input.displayName).toBe('Анна Ким');
        expect(input.isActive).toBe(false);
    });

    it('пустое имя равно его отсутствию: просьба показывать логин', () => {
        const input = validateCreateUserInput({
            username: 'ivan',
            password: 'sufficient-password',
            role: 'editor',
            displayName: '   ',
        });

        expect(input.displayName).toBeNull();
    });

    it('отклоняет имя с управляющим символом и неизвестные ключи создания', () => {
        // Перенос строки внутри имени сломал бы строку списка и меню профиля
        expect(() =>
            validateCreateUserInput({
                username: 'ivan',
                password: 'sufficient-password',
                role: 'editor',
                displayName: 'Иван\nПетров',
            })
        ).toThrowError(expect.objectContaining({ statusCode: 400 }));

        expect(() =>
            validateCreateUserInput({
                username: 'ivan',
                password: 'sufficient-password',
                role: 'editor',
                avatarUrl: 'https://example.test/photo.webp',
            })
        ).toThrowError(expect.objectContaining({ statusCode: 400 }));
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
