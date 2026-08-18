/**
 * Состояние раздела «Пользователи»: сколько запросов уходит за списком, чем
 * различаются отказы и как список правится после операций.
 *
 * Что здесь сторожится:
 *
 * 1. Список читается ОДИН раз на приложение: рейл со счётчиком и сам раздел
 *    спрашивают одно состояние, и без дедупликации первый кадр отправил бы два
 *    одинаковых GET.
 * 2. 403 и 404 — не «попробуйте ещё раз», а «раздела в этой установке нет»:
 *    состояние `unavailable` убирает пункт рейла, тогда как 5xx оставляет раздел
 *    с кнопкой повтора.
 * 3. Счётчик до готовности списка равен `null`, а не нулю: ноль читался бы как
 *    «учёток нет», чего не бывает — кто-то же вошёл.
 * 4. Последний активный администратор определяется по ПОЛНОМУ списку: замок в
 *    его строке появляется до клика, а не 409 после.
 * 5. Перечитывание готового списка идёт тихо — строки на экране не гаснут:
 *    раздел читает список при каждом входе, и спиннер поверх известных строк
 *    отнимал бы у человека то, за чем он пришёл. Первое чтение при этом
 *    состояние загрузки сохраняет: «ещё не знаем» и «знаем, что пусто» —
 *    разные вещи.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';
// #endregion

// #region Mocks
const { apiFetcherMock, permissions } = vi.hoisted(() => ({
    apiFetcherMock: vi.fn(),
    permissions: { canManageUsers: true },
}));

vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));

vi.mock('../../src/runtime/modules/builder/core/composables/useBuilderPermissions', () => ({
    useBuilderPermissions: () => ({
        canManageUsers: { value: permissions.canManageUsers },
    }),
}));
// #endregion

import { resetNuxtStateStub } from '../stubs/nuxt-imports';
import { useUsersData } from '../../src/runtime/modules/builder/users/composables/useUsersData';
import type { IBricksUserSummary } from '../../src/runtime/modules/common/types/auth';

/**
 * Учётка списка с переопределяемыми полями.
 *
 * @param overrides - Поля, отличающиеся от дефолтных.
 * @returns Учётка.
 */
function makeUser(overrides: Partial<IBricksUserSummary> = {}): IBricksUserSummary {
    return {
        id: 1,
        username: 'anna.editor',
        role: 'editor',
        isActive: true,
        displayName: null,
        avatarUrl: null,
        createdAt: '2026-04-02T10:00:00.000Z',
        lastLoginAt: null,
        ...overrides,
    };
}

/**
 * Ошибка запроса со статусом — так её видит клиент ofetch.
 *
 * @param statusCode - HTTP-статус отказа.
 * @returns Ошибка.
 */
function makeRequestError(statusCode: number): Error {
    return Object.assign(new Error(`HTTP ${statusCode}`), { statusCode });
}

describe('useUsersData: список учёток', () => {
    beforeEach(() => {
        apiFetcherMock.mockReset();
        permissions.canManageUsers = true;
        resetNuxtStateStub();
    });

    // Гард живёт рядом с запросом, а не у вызывающего: у роли без права на раздел
    // запрос заведомо получит отказ, и второй потребитель списка легко забыл бы
    // спросить про право
    it('без права на управление учётками запрос не уходит вовсе', async () => {
        permissions.canManageUsers = false;

        const { ensureUsers, status, usersCount } = useUsersData();

        await ensureUsers();

        expect(apiFetcherMock).not.toHaveBeenCalled();
        expect(status.value).toBe('unavailable');
        expect(usersCount.value).toBeNull();
    });

    it('второй ensureUsers не отправляет второй запрос', async () => {
        apiFetcherMock.mockResolvedValue({ users: [makeUser()] });

        const first = useUsersData();
        const second = useUsersData();

        await Promise.all([first.ensureUsers(), second.ensureUsers()]);
        await first.ensureUsers();

        expect(apiFetcherMock).toHaveBeenCalledTimes(1);
        expect(apiFetcherMock).toHaveBeenCalledWith(
            '/api/bricks/users',
            expect.objectContaining({ timeout: expect.any(Number) })
        );
        expect(first.status.value).toBe('ready');
        expect(second.users.value).toHaveLength(1);
    });

    it('refreshUsers перечитывает список принудительно', async () => {
        apiFetcherMock.mockResolvedValueOnce({ users: [makeUser()] });
        apiFetcherMock.mockResolvedValueOnce({ users: [makeUser(), makeUser({ id: 2 })] });

        const { ensureUsers, refreshUsers, users } = useUsersData();

        await ensureUsers();
        await refreshUsers();

        expect(apiFetcherMock).toHaveBeenCalledTimes(2);
        expect(users.value).toHaveLength(2);
    });

    // Список перечитывается при каждом входе в раздел, и спиннер вместо готовых
    // строк на это время отнимал бы у человека ровно то, за чем он пришёл
    it('перечитывание готового списка не гасит показанные строки', async () => {
        apiFetcherMock.mockResolvedValueOnce({ users: [makeUser()] });

        const { ensureUsers, refreshUsers, users, status } = useUsersData();

        await ensureUsers();

        let statusDuringRefresh: string | null = null;
        let usersDuringRefresh: IBricksUserSummary[] = [];

        apiFetcherMock.mockImplementationOnce(() => {
            statusDuringRefresh = status.value;
            usersDuringRefresh = users.value;

            return Promise.resolve({ users: [makeUser(), makeUser({ id: 2 })] });
        });

        await refreshUsers();

        expect(statusDuringRefresh).toBe('ready');
        expect(usersDuringRefresh).toHaveLength(1);
        expect(users.value).toHaveLength(2);
    });

    // Первое чтение гасить нечего, и состояние обязано отличать «ещё не знаем»
    // от «знаем, что пусто»: без этого раздел утверждал бы отсутствие учёток
    it('первое чтение проходит через состояние загрузки', async () => {
        let statusDuringLoad: string | null = null;

        const { ensureUsers, status } = useUsersData();

        apiFetcherMock.mockImplementationOnce(() => {
            statusDuringLoad = status.value;

            return Promise.resolve({ users: [makeUser()] });
        });

        await ensureUsers();

        expect(statusDuringLoad).toBe('loading');
    });

    // 403 и 404 означают «раздела нет»: повторять их бессмысленно, а пункт рейла
    // при них исчезает
    it.each([403, 404])('отказ %i помечает раздел недоступным и не повторяется', async (status) => {
        apiFetcherMock.mockRejectedValue(makeRequestError(status));

        const { ensureUsers, status: sectionStatus } = useUsersData();

        await ensureUsers();
        await ensureUsers();

        expect(sectionStatus.value).toBe('unavailable');
        expect(apiFetcherMock).toHaveBeenCalledTimes(1);
    });

    // 5xx — временная неисправность: раздел остаётся, повтор осмыслен
    it('отказ 500 оставляет раздел с возможностью повтора', async () => {
        apiFetcherMock.mockRejectedValueOnce(makeRequestError(500));
        apiFetcherMock.mockResolvedValueOnce({ users: [makeUser()] });

        const { ensureUsers, status } = useUsersData();

        await ensureUsers();
        expect(status.value).toBe('error');

        await ensureUsers();
        expect(status.value).toBe('ready');
        expect(apiFetcherMock).toHaveBeenCalledTimes(2);
    });

    it('счётчик рейла до готовности списка не показывается', async () => {
        apiFetcherMock.mockResolvedValue({ users: [makeUser(), makeUser({ id: 2 })] });

        const { usersCount, ensureUsers } = useUsersData();

        expect(usersCount.value).toBeNull();

        await ensureUsers();

        expect(usersCount.value).toBe(2);
    });

    it('созданная учётка встаёт в конец списка, известная — на своё место', async () => {
        apiFetcherMock.mockResolvedValue({
            users: [makeUser({ id: 1 }), makeUser({ id: 2, username: 'pavel.editor' })],
        });

        const { ensureUsers, users, upsertUser, removeUser } = useUsersData();

        await ensureUsers();

        upsertUser(makeUser({ id: 3, username: 'qa.viewer', role: 'viewer' }));
        expect(users.value.map((user) => user.id)).toEqual([1, 2, 3]);

        upsertUser(makeUser({ id: 2, username: 'pavel.editor', role: 'admin' }));
        expect(users.value.map((user) => user.id)).toEqual([1, 2, 3]);
        expect(users.value[1].role).toBe('admin');

        removeUser(2);
        expect(users.value.map((user) => user.id)).toEqual([1, 3]);
    });

    describe('последний активный администратор', () => {
        it('единственный активный админ опознаётся по полному списку', async () => {
            apiFetcherMock.mockResolvedValue({
                users: [
                    makeUser({ id: 1, role: 'admin' }),
                    makeUser({ id: 2, role: 'editor' }),
                    // Деактивированный админ систему не спасает: войти он не может
                    makeUser({ id: 3, role: 'admin', isActive: false }),
                ],
            });

            const { ensureUsers, lastActiveAdminId } = useUsersData();

            await ensureUsers();

            expect(lastActiveAdminId.value).toBe(1);
        });

        it('при двух активных админах замка нет ни у кого', async () => {
            apiFetcherMock.mockResolvedValue({
                users: [makeUser({ id: 1, role: 'admin' }), makeUser({ id: 2, role: 'admin' })],
            });

            const { ensureUsers, lastActiveAdminId } = useUsersData();

            await ensureUsers();

            expect(lastActiveAdminId.value).toBeNull();
        });

        it('понижение второго админа зажигает замок у первого', async () => {
            apiFetcherMock.mockResolvedValue({
                users: [makeUser({ id: 1, role: 'admin' }), makeUser({ id: 2, role: 'admin' })],
            });

            const { ensureUsers, upsertUser, lastActiveAdminId } = useUsersData();

            await ensureUsers();
            upsertUser(makeUser({ id: 2, role: 'editor' }));

            expect(lastActiveAdminId.value).toBe(1);
        });
    });
});
