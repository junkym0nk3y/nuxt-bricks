/**
 * Состояние профиля сессии: чем оно наполняется на SSR, что уезжает в payload
 * гидрации и сколько запросов уходит в сборке без SSR.
 *
 * Три решения, которые здесь сторожатся:
 *
 * 1. В состояние кладётся ПРОЕКЦИЯ пользователя сессии, а не он сам: контекст
 *    запроса несёт `authVersion` (поколение креденшелов) и признак активности, а
 *    это состояние уезжает в исходник страницы.
 * 2. Ручка `me` в сборке без SSR уходит ОДНА на профиль и роль: роль берётся из
 *    уже полученного профиля.
 * 3. Ответ каждой ручки профиля пишется в то же состояние — угол дашборда, угол
 *    билдера и модалка читают одно значение и не могут разойтись.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';
// #endregion

// #region Mocks
const { apiFetcherMock, requestContext } = vi.hoisted(() => ({
    apiFetcherMock: vi.fn(),
    requestContext: { user: undefined as Record<string, unknown> | undefined },
}));

vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));

vi.mock('../../src/runtime/modules/common/composables/useBricksRoutePaths', () => ({
    useBricksRoutePaths: () => ({
        builderLoginPath: '/bricks/bricks-login',
        withBase: (path: string) => path,
    }),
}));

vi.mock('#imports', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();

    return {
        ...actual,
        useRuntimeConfig: () => ({ public: { bricksAuthMode: 'database' } }),
        useRequestEvent: () => ({ context: { bricksUser: requestContext.user } }),
    };
});
// #endregion

import { resetNuxtStateStub } from '../stubs/nuxt-imports';
import { useAuthProfile } from '../../src/runtime/modules/builder/auth/composables/useAuthProfile';

describe('useAuthProfile: профиль сессии', () => {
    beforeEach(() => {
        apiFetcherMock.mockReset();
        requestContext.user = undefined;
        resetNuxtStateStub();
    });

    it('на SSR профиль берётся из контекста запроса без обращения к ручке', () => {
        requestContext.user = {
            id: 7,
            username: 'admin',
            role: 'admin',
            displayName: 'Сергей',
            avatarUrl: 'https://cdn/avatar.webp',
            isActive: true,
            authVersion: 42,
        };

        const { profile } = useAuthProfile();

        expect(profile.value).toEqual({
            id: 7,
            username: 'admin',
            role: 'admin',
            displayName: 'Сергей',
            avatarUrl: 'https://cdn/avatar.webp',
        });
        expect(apiFetcherMock).not.toHaveBeenCalled();
    });

    // Поколение креденшелов и признак активности в payload гидрации не нужны
    // никому, кроме того, кто соберётся их подделать
    it('поколение креденшелов и активность в состояние не попадают', () => {
        requestContext.user = {
            id: 7,
            username: 'admin',
            role: 'admin',
            displayName: null,
            avatarUrl: null,
            isActive: true,
            authVersion: 42,
        };

        const { profile } = useAuthProfile();

        expect(profile.value).not.toHaveProperty('authVersion');
        expect(profile.value).not.toHaveProperty('isActive');
    });

    it('без контекста запроса профиль досылается одним запросом `me`', async () => {
        apiFetcherMock.mockResolvedValueOnce({
            user: { id: 3, username: 'editor', role: 'editor' },
        });

        const { profile, ensureProfile } = useAuthProfile();

        await ensureProfile();

        expect(apiFetcherMock).toHaveBeenCalledTimes(1);
        expect(apiFetcherMock).toHaveBeenCalledWith('/api/bricks/auth/me');
        // Ответ логина имя и фото не несёт: «нет фото» и «не знаем» обязаны быть
        // различимы, поэтому наружу уходит null, а не undefined
        expect(profile.value).toEqual({
            id: 3,
            username: 'editor',
            role: 'editor',
            displayName: null,
            avatarUrl: null,
        });
    });

    it('повторная досылка запроса не делает — состояние уже наполнено', async () => {
        apiFetcherMock.mockResolvedValueOnce({
            user: { id: 3, username: 'editor', role: 'editor' },
        });

        const { ensureProfile } = useAuthProfile();

        await ensureProfile();
        await ensureProfile();
        await useAuthProfile().ensureProfile();

        expect(apiFetcherMock).toHaveBeenCalledTimes(1);
    });

    // Упавший `me` не должен уносить экран: аватар в углу — не причина отказать
    // в работе всему билдеру
    it('отказ досылки не бросается наружу', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        apiFetcherMock.mockRejectedValueOnce(new Error('boom'));

        const { profile, ensureProfile } = useAuthProfile();

        await expect(ensureProfile()).resolves.toBeUndefined();
        expect(profile.value).toBeNull();

        consoleError.mockRestore();
    });

    it('подпись владельца — имя, а без имени логин', async () => {
        requestContext.user = {
            id: 7,
            username: 'admin',
            role: 'admin',
            displayName: '   ',
            avatarUrl: null,
        };

        const { displayLabel, saveDisplayName } = useAuthProfile();

        expect(displayLabel.value).toBe('admin');

        apiFetcherMock.mockResolvedValueOnce({
            user: {
                id: 7,
                username: 'admin',
                role: 'admin',
                displayName: 'Сергей Воронежев',
                avatarUrl: null,
            },
        });
        await saveDisplayName('Сергей Воронежев');

        expect(displayLabel.value).toBe('Сергей Воронежев');
    });
});

describe('useAuthProfile: правки пишут ответ ручки в общее состояние', () => {
    beforeEach(() => {
        apiFetcherMock.mockReset();
        requestContext.user = {
            id: 7,
            username: 'admin',
            role: 'admin',
            displayName: null,
            avatarUrl: null,
        };
        resetNuxtStateStub();
    });

    it('имя уходит в PATCH и возвращается в состояние', async () => {
        apiFetcherMock.mockResolvedValueOnce({
            user: {
                id: 7,
                username: 'admin',
                role: 'admin',
                displayName: 'Сергей',
                avatarUrl: null,
            },
        });

        const { profile, saveDisplayName } = useAuthProfile();

        await saveDisplayName('Сергей');

        const [path, options] = apiFetcherMock.mock.calls[0];

        expect(path).toBe('/api/bricks/users/me');
        expect(options.method).toBe('PATCH');
        expect(options.body).toEqual({ displayName: 'Сергей' });
        expect(profile.value?.displayName).toBe('Сергей');
    });

    it('фото уходит multipart-формой с рамкой кадрирования', async () => {
        apiFetcherMock.mockResolvedValueOnce({
            user: {
                id: 7,
                username: 'admin',
                role: 'admin',
                displayName: null,
                avatarUrl: 'https://cdn/new.webp',
            },
        });

        const { profile, uploadAvatar } = useAuthProfile();
        const file = new File([new Uint8Array([1, 2, 3])], 'photo.jpg', { type: 'image/jpeg' });

        await uploadAvatar(file, { left: 12, top: 34, side: 256 });

        const [path, options] = apiFetcherMock.mock.calls[0];
        const body = options.body as FormData;

        expect(path).toBe('/api/bricks/users/me/avatar');
        expect(options.method).toBe('POST');
        // Имена полей ровно те, что читает ручка: cropX/cropY/cropSide
        expect(body.get('cropX')).toBe('12');
        expect(body.get('cropY')).toBe('34');
        expect(body.get('cropSide')).toBe('256');
        expect(body.get('file')).toBe(file);
        // Content-type не ставится руками: boundary собирает FormData
        expect(options.headers).toBeUndefined();
        expect(profile.value?.avatarUrl).toBe('https://cdn/new.webp');
    });

    it('снятие фото возвращает учётку без ссылки', async () => {
        apiFetcherMock.mockResolvedValueOnce({
            user: {
                id: 7,
                username: 'admin',
                role: 'admin',
                displayName: null,
                avatarUrl: null,
            },
        });

        const { profile, removeAvatar } = useAuthProfile();

        await removeAvatar();

        const [path, options] = apiFetcherMock.mock.calls[0];

        expect(path).toBe('/api/bricks/users/me/avatar');
        expect(options.method).toBe('DELETE');
        expect(profile.value?.avatarUrl).toBeNull();
    });

    // Успех смены пароля рвёт ВСЕ сессии, включая текущую: профиль в состоянии
    // трогать нельзя — уводить человека на вход обязан вызывающий
    it('смена пароля не пишет профиль в состояние', async () => {
        apiFetcherMock.mockResolvedValueOnce({ success: true });

        const { profile, changeOwnPassword } = useAuthProfile();
        const before = profile.value;

        await changeOwnPassword('old-password', 'new-password');

        const [path, options] = apiFetcherMock.mock.calls[0];

        expect(path).toBe('/api/bricks/users/me/password');
        expect(options.body).toEqual({
            currentPassword: 'old-password',
            newPassword: 'new-password',
        });
        expect(profile.value).toBe(before);
    });
});
