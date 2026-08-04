// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';
// #endregion

/**
 * `fetchMe` возвращал null на любую ошибку, поэтому 5xx и обрыв по потолку
 * ожидания выглядели как «не авторизован»: страница логина считала недоступность
 * сервера отсутствием сессии и молча предлагала войти.
 */

// #region Mocks
const { apiFetcherMock } = vi.hoisted(() => ({ apiFetcherMock: vi.fn() }));

vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));

vi.mock('../../src/runtime/modules/common/composables/useBricksRoutePaths', () => ({
    useBricksRoutePaths: () => ({
        builderLoginPath: '/bricks/bricks-login',
        withBase: (path: string) => path,
    }),
}));
// #endregion

import { useAuthSession } from '../../src/runtime/modules/builder/auth/composables/useAuthSession';

describe('useAuthSession.fetchMe: 401 против недоступности сервера', () => {
    beforeEach(() => {
        apiFetcherMock.mockReset();
    });

    it('401 означает отсутствие сессии', async () => {
        apiFetcherMock.mockRejectedValueOnce(Object.assign(new Error('401'), { statusCode: 401 }));

        await expect(useAuthSession().fetchMe()).resolves.toBeNull();
    });

    it('отказ сервера не выдаётся за отсутствие сессии', async () => {
        apiFetcherMock.mockRejectedValueOnce(Object.assign(new Error('500'), { statusCode: 500 }));

        await expect(useAuthSession().fetchMe()).rejects.toThrow('500');
    });

    it('обрыв по потолку ожидания не выдаётся за отсутствие сессии', async () => {
        const timeout = Object.assign(new Error('aborted due to timeout'), {
            name: 'TimeoutError',
        });
        apiFetcherMock.mockRejectedValueOnce(
            new Error('[GET] "/api/bricks/auth/me": <no response>', { cause: timeout })
        );

        await expect(useAuthSession().fetchMe()).rejects.toThrow('<no response>');
    });

    it('успешный ответ отдаёт пользователя сессии', async () => {
        apiFetcherMock.mockResolvedValueOnce({ user: { id: 1, username: 'editor' } });

        await expect(useAuthSession().fetchMe()).resolves.toEqual({ id: 1, username: 'editor' });
    });
});
