/**
 * Операции над чужой учёткой: роль, вход и удаление.
 *
 * Что здесь сторожится:
 *
 * 1. Ни одна операция не оптимистична: строка меняется ответом ручки, и
 *    отказ оставляет её прежней.
 * 2. Повторный выбор ТЕКУЩЕЙ роли запроса не отправляет: сервер такую правку
 *    игнорирует, а тост «сессии завершены» после неё был бы ложью.
 * 3. Пока идёт операция, вторая над той же строкой не начинается: два ответа с
 *    полным состоянием учётки перезаписали бы друг друга в порядке прихода.
 * 4. Отказ, показавший расхождение с сервером (краевое правило, исчезнувшая
 *    учётка), и обрыв по потолку ожидания перечитывают список: в первом случае
 *    показанное состояние отстало, во втором исход операции неизвестен.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';
// #endregion

// #region Mocks
const { apiFetcherMock } = vi.hoisted(() => ({ apiFetcherMock: vi.fn() }));

vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));
vi.mock('../../src/runtime/modules/builder/core/composables/useBuilderPermissions', () => ({
    useBuilderPermissions: () => ({ canManageUsers: { value: true } }),
}));

vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        // Пустой набор параметров печатается как его отсутствие: `vue-i18n`
        // рендерит `t(key, {})` и `t(key)` одинаково, и мок не должен добавлять
        // различие, которого в приложении нет
        t: (key: string, params?: Record<string, unknown>) =>
            params && Object.keys(params).length > 0 ? `${key}:${JSON.stringify(params)}` : key,
    }),
}));
// #endregion

import { resetNuxtStateStub } from '../stubs/nuxt-imports';
import { useUsersActions } from '../../src/runtime/modules/builder/users/composables/useUsersActions';
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
 * Отказ ручки с машиночитаемым кодом — так его видит клиент.
 *
 * @param statusCode - HTTP-статус.
 * @param code - Код в `data.code`.
 * @returns Ошибка.
 */
function makeCodedError(statusCode: number, code: string): Error {
    return Object.assign(new Error(`HTTP ${statusCode}`), { statusCode, data: { code } });
}

/**
 * Наполняет состояние списка учётками через первую загрузку.
 *
 * @param users - Учётки ответа ручки.
 */
async function seedUsers(users: IBricksUserSummary[]): Promise<void> {
    apiFetcherMock.mockResolvedValueOnce({ users });

    await useUsersData().ensureUsers();
}

describe('useUsersActions: операции над учёткой', () => {
    const notify = vi.fn();

    beforeEach(() => {
        apiFetcherMock.mockReset();
        notify.mockReset();
        resetNuxtStateStub();
    });

    it('смена роли идёт PATCH и заменяет строку ответом ручки', async () => {
        await seedUsers([makeUser()]);
        apiFetcherMock.mockResolvedValueOnce({ user: makeUser({ role: 'admin' }) });

        const { users } = useUsersData();
        const actions = useUsersActions({ onNotify: notify });

        await actions.changeRole(makeUser(), 'admin');

        expect(apiFetcherMock).toHaveBeenLastCalledWith(
            '/api/bricks/users/1',
            expect.objectContaining({ method: 'PATCH', body: { role: 'admin' } })
        );
        expect(users.value[0].role).toBe('admin');
        expect(notify).toHaveBeenCalledWith('bricks.users.toasts.roleChanged', 'success');
    });

    it('повторный выбор той же роли не отправляет запрос и молчит', async () => {
        await seedUsers([makeUser()]);
        apiFetcherMock.mockClear();

        const actions = useUsersActions({ onNotify: notify });

        await actions.changeRole(makeUser({ role: 'editor' }), 'editor');

        expect(apiFetcherMock).not.toHaveBeenCalled();
        expect(notify).not.toHaveBeenCalled();
    });

    it('отказ смены роли оставляет прежнюю роль в списке', async () => {
        await seedUsers([makeUser()]);
        apiFetcherMock.mockRejectedValueOnce(
            Object.assign(new Error('HTTP 500'), { statusCode: 500 })
        );

        const { users } = useUsersData();
        const actions = useUsersActions({ onNotify: notify });

        await actions.changeRole(makeUser(), 'admin');

        expect(users.value[0].role).toBe('editor');
        expect(notify).toHaveBeenCalledWith('bricks.users.errors.actionFailed', 'error');
    });

    // Замок и своя строка закрывают эти отказы заранее, поэтому их появление —
    // сигнал того, что список отстал от базы
    it('LAST_ACTIVE_ADMIN сообщает причину и перечитывает список', async () => {
        await seedUsers([makeUser({ role: 'admin' })]);
        apiFetcherMock.mockRejectedValueOnce(makeCodedError(409, 'LAST_ACTIVE_ADMIN'));
        apiFetcherMock.mockResolvedValueOnce({ users: [makeUser({ role: 'admin' })] });

        const actions = useUsersActions({ onNotify: notify });

        await actions.changeRole(makeUser({ role: 'admin' }), 'editor');

        expect(notify).toHaveBeenCalledWith('bricks.users.errors.lastActiveAdmin', 'error');
        expect(apiFetcherMock).toHaveBeenLastCalledWith(
            '/api/bricks/users',
            expect.objectContaining({ timeout: expect.any(Number) })
        );
    });

    it('обрыв по потолку ожидания перечитывает список: исход неизвестен', async () => {
        await seedUsers([makeUser()]);
        // Обрыв по потолку ожидания опознаётся по имени ошибки — так его ставит
        // политика запросов (`applyApiRequestTimeout`)
        apiFetcherMock.mockRejectedValueOnce(
            Object.assign(new Error('timeout'), { name: 'TimeoutError' })
        );
        apiFetcherMock.mockResolvedValueOnce({ users: [makeUser({ role: 'admin' })] });

        const { users } = useUsersData();
        const actions = useUsersActions({ onNotify: notify });

        await actions.changeRole(makeUser(), 'admin');

        expect(notify).toHaveBeenCalledWith('bricks.users.errors.timeout', 'error');
        expect(users.value[0].role).toBe('admin');
    });

    it('вторая операция над строкой не начинается, пока идёт первая', async () => {
        await seedUsers([makeUser()]);
        // Загрузка списка из счёта запросов убирается: считаем только сами операции
        apiFetcherMock.mockClear();

        // Заглушка до присваивания реального resolve: без неё тип пришлось бы
        // расширять до `undefined`, а обращение к ней происходит только после
        // старта операции
        let releaseFirst: (value: { user: IBricksUserSummary }) => void = () => undefined;
        apiFetcherMock.mockImplementationOnce(
            () =>
                new Promise<{ user: IBricksUserSummary }>((resolve) => {
                    releaseFirst = resolve;
                })
        );

        const actions = useUsersActions({ onNotify: notify });
        const firstOperation = actions.changeRole(makeUser(), 'admin');

        expect(actions.pendingUserId.value).toBe(1);

        await actions.activateUser(makeUser({ isActive: false }));
        expect(apiFetcherMock).toHaveBeenCalledTimes(1);

        releaseFirst({ user: makeUser({ role: 'admin' }) });
        await firstOperation;

        expect(actions.pendingUserId.value).toBeNull();
    });

    describe('подтверждения', () => {
        it('выключение входа спрашивает подтверждение и шлёт isActive false', async () => {
            await seedUsers([makeUser()]);
            apiFetcherMock.mockResolvedValueOnce({ user: makeUser({ isActive: false }) });

            const { users } = useUsersData();
            const actions = useUsersActions({ onNotify: notify });

            actions.requestConfirm('deactivate', makeUser());

            expect(actions.isConfirmOpen.value).toBe(true);
            expect(actions.confirmTitle.value).toContain('bricks.users.confirm.deactivate.title');
            expect(actions.confirmTitle.value).toContain('anna.editor');

            await actions.confirmAction();

            expect(apiFetcherMock).toHaveBeenLastCalledWith(
                '/api/bricks/users/1',
                expect.objectContaining({ method: 'PATCH', body: { isActive: false } })
            );
            expect(users.value[0].isActive).toBe(false);
            expect(actions.isConfirmOpen.value).toBe(false);
        });

        it('удаление снимает строку только после ответа сервера', async () => {
            await seedUsers([makeUser(), makeUser({ id: 2, username: 'pavel.editor' })]);
            apiFetcherMock.mockResolvedValueOnce({ success: true });

            const { users } = useUsersData();
            const actions = useUsersActions({ onNotify: notify });

            actions.requestConfirm('delete', makeUser());
            await actions.confirmAction();

            expect(apiFetcherMock).toHaveBeenLastCalledWith(
                '/api/bricks/users/1',
                expect.objectContaining({ method: 'DELETE' })
            );
            expect(users.value.map((user) => user.id)).toEqual([2]);
        });

        it('отказ удаления оставляет строку на месте', async () => {
            await seedUsers([makeUser()]);
            apiFetcherMock.mockRejectedValueOnce(makeCodedError(409, 'LAST_ACTIVE_ADMIN'));
            apiFetcherMock.mockResolvedValueOnce({ users: [makeUser()] });

            const { users } = useUsersData();
            const actions = useUsersActions({ onNotify: notify });

            actions.requestConfirm('delete', makeUser());
            await actions.confirmAction();

            expect(users.value).toHaveLength(1);
            expect(notify).toHaveBeenCalledWith('bricks.users.errors.lastActiveAdmin', 'error');
        });

        it('закрытие подтверждения снимает цель — заголовок не переезжает в следующий диалог', async () => {
            await seedUsers([makeUser()]);

            const actions = useUsersActions({ onNotify: notify });

            actions.requestConfirm('delete', makeUser());
            actions.closeConfirm();

            expect(actions.isConfirmOpen.value).toBe(false);
            expect(actions.confirmTitle.value).toBe('');
        });
    });
});
