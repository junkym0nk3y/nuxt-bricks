// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Types
import type { H3Event } from 'h3';

// Utils
import { createFakeH3Event } from '../helpers/h3Events';
// #endregion

/**
 * Ручки своего профиля доступны любому вошедшему и от флага раздела учёток не
 * зависят. Проверяем именно эти границы плюс валидацию тела: она и есть то, что
 * отделяет «правку своего имени» от подстановки чужой ссылки в колонку фото.
 */

// #region Mocks
/**
 * Конфигурация запроса, которую подменяет тест: `profile.ts` и
 * `userManagement.ts` читают её через `useRuntimeConfig(event)` (паттерн
 * test/server/authUserManagement.spec.ts).
 */
const runtimeConfig: Record<string, unknown> = { bricksAuthMode: 'database' };

vi.mock('nitropack/runtime', () => ({
    useRuntimeConfig: () => runtimeConfig,
}));

const {
    assertProfileAvailable,
    invalidCurrentPassword,
    requireSessionUser,
    toAuthProfileUser,
    validateOwnPasswordPayload,
    validateProfilePayload,
} = await import('../../src/runtime/server/utils/auth/profile');
const { assertPasswordChangeAllowed } =
    await import('../../src/runtime/server/utils/auth/userManagement');
const { BRICKS_API_ERROR_CODES } =
    await import('../../src/runtime/modules/common/constants/apiErrors');
// #endregion

/**
 * Событие запроса от пользователя сессии.
 *
 * @param user - Пользователь, которого положило auth-middleware.
 * @returns Событие h3 в минимальной форме.
 */
function createEvent(user?: Record<string, unknown>): H3Event {
    return createFakeH3Event({ context: user ? { bricksUser: user } : {} });
}

describe('profile: доступность ручек своего профиля', () => {
    beforeEach(() => {
        runtimeConfig.bricksAuthMode = 'database';
        runtimeConfig.bricksAuthAllowUserManagement = true;
        runtimeConfig.bricksAuthAllowPasswordChange = true;
    });

    it('отвечает 404 вне database-режима: править нечего, identity задана окружением', () => {
        runtimeConfig.bricksAuthMode = 'basic';

        expect(() => assertProfileAvailable(createEvent({ id: 1 }))).toThrowError(
            expect.objectContaining({ statusCode: 404 })
        );
    });

    it('НЕ зависит от флага управления учётками', () => {
        // Флаг про ведение чужих учёток снаружи. Закрой он профиль — и человек в
        // такой установке не смог бы сменить себе ни имя, ни фото, ни пароль
        runtimeConfig.bricksAuthAllowUserManagement = false;

        expect(() => assertProfileAvailable(createEvent({ id: 1 }))).not.toThrow();
    });

    it('закрывает пароль отдельным флагом с машиночитаемым кодом', () => {
        runtimeConfig.bricksAuthAllowPasswordChange = false;

        expect(() => assertPasswordChangeAllowed(createEvent({ id: 1 }))).toThrowError(
            expect.objectContaining({
                statusCode: 403,
                data: { code: BRICKS_API_ERROR_CODES.passwordChangeDisabled },
            })
        );
    });

    it('отдаёт пользователя сессии и отказывает 401 без него', () => {
        expect(requireSessionUser(createEvent({ id: 7, username: 'ivan' })).id).toBe(7);

        // Иначе правка ушла бы с `undefined` в id — то есть не в ту учётку
        expect(() => requireSessionUser(createEvent())).toThrowError(
            expect.objectContaining({ statusCode: 401 })
        );
    });
});

describe('profile: проекция ответа «кто я»', () => {
    it('не отдаёт наружу активность и дату создания', () => {
        expect(
            toAuthProfileUser({
                id: 3,
                username: 'ivan',
                role: 'editor',
                displayName: 'Иван',
                avatarUrl: 'https://s3.example/bricks-avatars/user-3-uuid.webp',
                // Лишние поля строки учётки: проекция обязана их отбросить
                isActive: true,
                createdAt: '2026-08-17T00:00:00.000Z',
            } as never)
        ).toEqual({
            id: 3,
            username: 'ivan',
            role: 'editor',
            displayName: 'Иван',
            avatarUrl: 'https://s3.example/bricks-avatars/user-3-uuid.webp',
        });
    });
});

describe('profile: валидация правки профиля', () => {
    it('не принимает ссылку на фото: её ставят только ручки аватара', () => {
        // Разреши поле — и в колонку уехал бы произвольный внешний адрес, который
        // грузится в углу билдера у каждого, кто видит эту учётку
        // Имя в теле есть, поэтому отказать может только запрет самого ключа:
        // без него отказ пришёл бы от «имя обязательно» и ничего не сторожил
        expect(() =>
            validateProfilePayload({
                displayName: 'Иван',
                avatarUrl: 'https://evil.example/track.png',
            })
        ).toThrowError(expect.objectContaining({ statusCode: 400 }));

        expect(() => validateProfilePayload({ displayName: 'Иван', role: 'admin' })).toThrowError(
            expect.objectContaining({ statusCode: 400 })
        );
        expect(() => validateProfilePayload({ username: 'other' })).toThrowError(
            expect.objectContaining({ statusCode: 400 })
        );

        // В правку уходит ровно одно поле: лишний ключ не должен появиться и
        // «сам собой», из формы результата
        expect(validateProfilePayload({ displayName: 'Иван' })).toEqual({ displayName: 'Иван' });
    });

    it('требует само поле: пустое тело не «сохранить как есть»', () => {
        expect(() => validateProfilePayload({})).toThrowError(
            expect.objectContaining({ statusCode: 400 })
        );
    });

    it('приравнивает пустое имя к отсутствию: показывается логин', () => {
        expect(validateProfilePayload({ displayName: '   ' })).toEqual({ displayName: null });
        expect(validateProfilePayload({ displayName: null })).toEqual({ displayName: null });
    });

    it('обрезает пробелы по краям и отклоняет перевод строки', () => {
        expect(validateProfilePayload({ displayName: '  Иван Петров  ' })).toEqual({
            displayName: 'Иван Петров',
        });

        // Управляющие символы сломали бы строку списка и меню профиля
        expect(() => validateProfilePayload({ displayName: 'Иван\nПетров' })).toThrowError(
            expect.objectContaining({ statusCode: 400 })
        );
    });

    it('отклоняет слишком длинное имя', () => {
        expect(() => validateProfilePayload({ displayName: 'и'.repeat(65) })).toThrowError(
            expect.objectContaining({ statusCode: 400 })
        );
    });
});

describe('profile: валидация смены своего пароля', () => {
    it('требует текущий пароль — без него украденная кука сменила бы пароль сама', () => {
        expect(() =>
            validateOwnPasswordPayload({ newPassword: 'sufficient-password' })
        ).toThrowError(expect.objectContaining({ statusCode: 400 }));

        expect(() =>
            validateOwnPasswordPayload({ currentPassword: '', newPassword: 'sufficient-password' })
        ).toThrowError(expect.objectContaining({ statusCode: 400 }));
    });

    it('не применяет минимальную длину к ТЕКУЩЕМУ паролю', () => {
        // Учётку мог создать CLI с более коротким паролем: требуй от текущего
        // восьми символов — и такой человек не сменил бы пароль вовсе
        expect(
            validateOwnPasswordPayload({
                currentPassword: 'short',
                newPassword: 'sufficient-password',
            })
        ).toEqual({ currentPassword: 'short', newPassword: 'sufficient-password' });
    });

    it('применяет к новому паролю те же границы, что админский путь', () => {
        // Имя поля в сообщении — своё: подсказка формы иначе встала бы под чужое
        expect(() =>
            validateOwnPasswordPayload({ currentPassword: 'whatever', newPassword: 'short' })
        ).toThrowError(
            expect.objectContaining({
                statusCode: 400,
                statusMessage: expect.stringContaining('"newPassword"'),
            })
        );
    });

    it('не обрезает пробелы пароля и отклоняет неизвестные ключи', () => {
        expect(
            validateOwnPasswordPayload({
                currentPassword: ' spaced ',
                newPassword: '  spaced pass  ',
            })
        ).toEqual({ currentPassword: ' spaced ', newPassword: '  spaced pass  ' });

        expect(() =>
            validateOwnPasswordPayload({
                currentPassword: 'whatever',
                newPassword: 'sufficient-password',
                userId: 5,
            })
        ).toThrowError(expect.objectContaining({ statusCode: 400 }));
    });

    it('отвечает на неверный текущий пароль 400 с кодом, а не 401', () => {
        // 401 увёл бы человека с рабочей сессией на форму логина: клиентский
        // интерцептор смотрит на статус, а не на путь
        expect(() => invalidCurrentPassword()).toThrowError(
            expect.objectContaining({
                statusCode: 400,
                data: { code: BRICKS_API_ERROR_CODES.invalidCurrentPassword },
            })
        );
    });
});
