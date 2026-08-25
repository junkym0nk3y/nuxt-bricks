// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Types
import type { H3Event } from 'h3';
import type { IThrownHttpError } from '../helpers/types';
import type { IUploadedFilePart } from '../../src/runtime/modules/persistence/types/media';

// Utils
import { createFakeH3Event } from '../helpers/h3Events';
// #endregion

/**
 * Гарды, которые стоят в САМИХ ручках профиля: доступность режима и лимит
 * запросов по IP.
 *
 * Отдельной спекой, потому что проверяется именно вызов гарда в ручке. Юниты на
 * `assertProfileAvailable` и на лимитер уже есть, но пропажу их вызова из ручки
 * они поймать не могут: в прочих спеках профиля всегда database-режим и всегда
 * первый запрос, поэтому удаление обеих строк оставляло набор зелёным.
 */

// #region Mocks
const { runtimeConfig, authAdapterMock, publishAdapterMock, bodyMock, formParts } = vi.hoisted(
    () => ({
        runtimeConfig: {
            bricksAuthMode: 'database',
            bricksAuthAllowPasswordChange: true,
        } as Record<string, unknown>,
        authAdapterMock: {
            getUserByUsername: vi.fn(),
            updateUserProfile: vi.fn(),
            updateOwnPassword: vi.fn(),
        },
        publishAdapterMock: {
            buildFileKey: vi.fn(),
            uploadFile: vi.fn(),
            deleteFile: vi.fn(),
            isOwnedUrl: vi.fn(),
        },
        bodyMock: { value: {} as Record<string, unknown> },
        formParts: { value: [] as IUploadedFilePart[] },
    })
);

vi.mock('nitropack/runtime', () => ({
    useRuntimeConfig: () => runtimeConfig,
    useAppConfig: () => ({}),
}));

vi.mock('../../src/runtime/modules/persistence/server/registry', () => ({
    useBricksAuthAdapter: () => authAdapterMock,
    useBricksPublishAdapter: () => publishAdapterMock,
}));

vi.mock(
    '../../src/runtime/modules/persistence/server/utils/handlerHelpers',
    async (importOriginal) => ({
        ...(await importOriginal<Record<string, unknown>>()),
        readNormalizedBody: async () => bodyMock.value,
    })
);

vi.mock(
    '../../src/runtime/modules/persistence/server/utils/multipartStream',
    async (importOriginal) => ({
        ...(await importOriginal<Record<string, unknown>>()),
        withMultipartFormData: async (
            _event: H3Event,
            _maxBytes: number,
            use: (parts: IUploadedFilePart[]) => Promise<unknown>
        ) => use(formParts.value),
    })
);

vi.mock('../../src/runtime/server/utils/auth/sessionCookie', () => ({
    clearSessionCookie: vi.fn(),
}));

const patchProfile = (await import('../../src/runtime/server/api/bricks/users/me.patch')).default;
const changeOwnPassword = (
    await import('../../src/runtime/server/api/bricks/users/me/password.post')
).default;
const uploadAvatar = (await import('../../src/runtime/server/api/bricks/users/me/avatar.post'))
    .default;
const deleteAvatar = (await import('../../src/runtime/server/api/bricks/users/me/avatar.delete'))
    .default;
// #endregion

// #region Fixtures
/** Все четыре ручки профиля: гард режима обязан быть в каждой. */
const PROFILE_HANDLERS = [
    { name: 'PATCH /users/me', handler: patchProfile },
    { name: 'POST /users/me/password', handler: changeOwnPassword },
    { name: 'POST /users/me/avatar', handler: uploadAvatar },
    { name: 'DELETE /users/me/avatar', handler: deleteAvatar },
];

/**
 * Событие запроса от пользователя сессии.
 *
 * @returns Событие h3 в минимальной форме.
 */
function createEvent(): H3Event {
    return createFakeH3Event({
        path: '/api/bricks/users/me',
        method: 'POST',
        context: {
            bricksUser: {
                id: 7,
                username: 'ivan',
                isActive: true,
                role: 'editor',
                authVersion: 1,
                displayName: null,
                avatarUrl: null,
            },
        },
    });
}

/**
 * Выполняет ручку и возвращает брошенную ей ошибку.
 *
 * @param handler - Обработчик маршрута.
 * @returns Пойманная ошибка.
 */
async function catchThrown(handler: (event: H3Event) => unknown): Promise<IThrownHttpError> {
    try {
        await handler(createEvent());
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
    bodyMock.value = { displayName: 'Иван' };
    formParts.value = [];
});

describe('ручки профиля: доступность режима', () => {
    it('отвечают 404 в basic-режиме, не трогая ни адаптеры, ни хранилище', async () => {
        // Учёток в basic нет вовсе: identity одна на всех и задана окружением,
        // править в ней нечего. Проверка стоит первой строкой каждой ручки
        runtimeConfig.bricksAuthMode = 'basic';

        for (const route of PROFILE_HANDLERS) {
            const error = await catchThrown(route.handler);

            expect(error.statusCode, route.name).toBe(404);
        }

        expect(authAdapterMock.updateUserProfile).not.toHaveBeenCalled();
        expect(authAdapterMock.getUserByUsername).not.toHaveBeenCalled();
        expect(authAdapterMock.updateOwnPassword).not.toHaveBeenCalled();
        expect(publishAdapterMock.uploadFile).not.toHaveBeenCalled();
    });
});

describe('ручки профиля: лимит запросов по IP', () => {
    it('смена своего пароля отдаёт 429 сверх лимита — до scrypt и до записи', async () => {
        // Ручка отвечает на вопрос «этот пароль верный?», то есть украденная кука
        // иначе перебирала бы по ней сам пароль. Тело намеренно невалидное:
        // бюджет тратится ДО его разбора, поэтому проверка не платит за scrypt
        bodyMock.value = {};

        const statuses: number[] = [];

        for (let attempt = 0; attempt < 11; attempt += 1) {
            statuses.push((await catchThrown(changeOwnPassword)).statusCode);
        }

        expect(statuses.slice(0, 10)).toEqual(Array.from({ length: 10 }, () => 400));
        expect(statuses.at(-1)).toBe(429);
        expect(authAdapterMock.getUserByUsername).not.toHaveBeenCalled();
    });

    it('загрузка аватара отдаёт 429 сверх лимита — до sharp и до заливки', async () => {
        // Каждая загрузка — проход sharp: без границы одна кука занимала бы
        // процессор целиком. Форма пустая, поэтому кадрирование не выполняется
        const statuses: number[] = [];

        for (let attempt = 0; attempt < 21; attempt += 1) {
            statuses.push((await catchThrown(uploadAvatar)).statusCode);
        }

        expect(statuses.slice(0, 20)).toEqual(Array.from({ length: 20 }, () => 400));
        expect(statuses.at(-1)).toBe(429);
        expect(publishAdapterMock.uploadFile).not.toHaveBeenCalled();
    });
});
