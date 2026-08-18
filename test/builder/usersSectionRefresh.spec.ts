/**
 * @vitest-environment happy-dom
 *
 * Вход в раздел «Пользователи» перечитывает список.
 *
 * Что здесь сторожится: показанное состояние не должно держаться до перезагрузки
 * страницы. Учётки правит не один человек — между двумя открытиями раздела
 * соседний администратор мог завести или выключить учётку, а строка, созданная
 * по оборванному запросу формы, появляется в базе уже после того, как форма о
 * ней сказала. Другого пути обновить список у раздела нет: кнопка повтора
 * показывается только в экране отказа.
 *
 * Секция монтируется ровно при открытии раздела (хост рисует её слот по
 * активному разделу), поэтому монтаж здесь и означает вход.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { mount } from '@vue/test-utils';
// #endregion

// #region Mocks
const { apiFetcherMock } = vi.hoisted(() => ({
    apiFetcherMock: vi.fn(),
}));

vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));

vi.mock('../../src/runtime/modules/builder/core/composables/useBuilderPermissions', () => ({
    useBuilderPermissions: () => ({
        canManageUsers: { value: true },
        canChangePassword: { value: true },
    }),
}));

vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));
// #endregion

import { resetNuxtStateStub } from '../stubs/nuxt-imports';
import { useUsersData } from '../../src/runtime/modules/builder/users/composables/useUsersData';
import TheBuilderUsersSection from '../../src/runtime/modules/builder/users/components/TheBuilderUsersSection.vue';

/**
 * Монтирует раздел без его разметки: проверяется поведение входа, а не вид.
 *
 * @returns Обёртка теста.
 */
function mountSection() {
    return mount(TheBuilderUsersSection, {
        props: {
            searchQuery: '',
            isCreateModalOpen: false,
            currentUserId: 1,
        },
        shallow: true,
    });
}

describe('TheBuilderUsersSection: вход в раздел', () => {
    beforeEach(() => {
        apiFetcherMock.mockReset();
        apiFetcherMock.mockResolvedValue({ users: [] });
        resetNuxtStateStub();
    });

    it('читает список даже тогда, когда он уже прочитан', async () => {
        const { ensureUsers } = useUsersData();

        await ensureUsers();

        expect(apiFetcherMock).toHaveBeenCalledTimes(1);

        mountSection();
        await Promise.resolve();

        expect(apiFetcherMock).toHaveBeenCalledTimes(2);
    });
});
