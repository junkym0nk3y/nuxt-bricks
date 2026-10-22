/**
 * @vitest-environment happy-dom
 *
 * Меню профиля в углу экрана: когда оно рисуется, что показывает и что уходит
 * наружу.
 *
 * Отдельно проверяется тулбар билдера: до этого экрана выхода из редактора не
 * было вовсе — logout жил только в футере рейла дашборда, — и без спеки дыра
 * вернулась бы молча при следующей правке тулбара.
 *
 * Клавиатурная навигация внутри меню (roving focus reka) здесь не проверяется:
 * в happy-dom фокус по коллекции узлов не переезжает, и тест падал бы на
 * исправном коде (см. `.claude/rules/testing.md`).
 */

// #region Imports
// Types
import type { TBricksUserRole } from '../../src/runtime/modules/common/types/auth';

// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
// #endregion

// #region Mocks
const { authState } = vi.hoisted(() => ({
    authState: {
        isDatabaseMode: true,
        profile: null as {
            id: number;
            username: string;
            role: TBricksUserRole;
            displayName: string | null;
            avatarUrl: string | null;
        } | null,
    },
}));

vi.mock('../../src/runtime/modules/builder/auth/composables/useAuthSession', () => ({
    useAuthSession: () => ({
        isDatabaseMode: authState.isDatabaseMode,
        login: vi.fn(),
        logout: vi.fn(),
        fetchMe: vi.fn(),
    }),
}));

vi.mock('../../src/runtime/modules/builder/auth/composables/useAuthProfile', async () => {
    const { computed } = await import('vue');

    return {
        useAuthProfile: () => ({
            profile: computed(() => authState.profile),
            displayLabel: computed(
                () => authState.profile?.displayName?.trim() || authState.profile?.username || ''
            ),
            ensureProfile: vi.fn(),
            saveDisplayName: vi.fn(),
            uploadAvatar: vi.fn(),
            removeAvatar: vi.fn(),
            changeOwnPassword: vi.fn(),
        }),
    };
});

vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        // Ключ и параметры вместо перевода: спека сверяет, ЧТО показано
        t: (key: string, params?: Record<string, unknown>) =>
            params ? `${key}:${JSON.stringify(params)}` : key,
        locale: { value: 'ru' },
    }),
}));
// #endregion

import BuilderAuthProfileMenu from '../../src/runtime/modules/builder/auth/components/BuilderAuthProfileMenu.vue';

/** Глобальная иконка билдера регистрируется плагином приложения — здесь заглушка. */
const BricksIconStub = defineComponent({
    name: 'BricksIcon',
    props: { icon: { type: String, default: '' } },
    setup: (props) => () => h('i', { 'data-icon': props.icon }),
});

/**
 * Монтирует меню профиля.
 *
 * @param props - Пропы компонента.
 * @returns Обёртка теста.
 */
function mountMenu(props: Record<string, unknown> = {}) {
    return mount(BuilderAuthProfileMenu, {
        props,
        global: { components: { BricksIcon: BricksIconStub } },
    });
}

describe('BuilderAuthProfileMenu: когда меню есть на экране', () => {
    beforeEach(() => {
        authState.isDatabaseMode = true;
        authState.profile = {
            id: 7,
            username: 'admin',
            role: 'admin',
            displayName: 'Сергей Воронежев',
            avatarUrl: null,
        };
    });

    it('в basic-режиме аватара нет вовсе: учёток и выхода в нём не существует', () => {
        authState.isDatabaseMode = false;

        expect(mountMenu().find('button').exists()).toBe(false);
    });

    it('без профиля аватар не рисуется — наполнять его нечем', () => {
        authState.profile = null;

        expect(mountMenu().find('button').exists()).toBe(false);
    });

    it('триггер получает доступное имя: внутри только декоративный аватар', () => {
        const trigger = mountMenu().find('button');

        expect(trigger.exists()).toBe(true);
        expect(trigger.attributes('aria-label')).toContain('bricks.auth.profile.menuLabel');
        expect(trigger.attributes('aria-label')).toContain('Сергей Воронежев');
    });

    it('вертикальная черта появляется только по просьбе поверхности', () => {
        const plainDividers = mountMenu().findAll('span[aria-hidden="true"]').length;
        const separatedDividers = mountMenu({ separated: true }).findAll(
            'span[aria-hidden="true"]'
        ).length;

        expect(separatedDividers).toBe(plainDividers + 1);
    });

    it('открытое меню показывает имя, логин с ролью и два действия', async () => {
        const wrapper = mountMenu();

        await wrapper.find('button').trigger('click');

        const menu = document.body.textContent ?? '';

        expect(menu).toContain('Сергей Воронежев');
        // Подпись под именем — про учётку: логин и роль
        expect(menu).toContain('admin · bricks.auth.roles.admin');
        expect(menu).toContain('bricks.auth.profile.open');
        expect(menu).toContain('bricks.auth.logout');

        wrapper.unmount();
    });

    it('без отображаемого имени подписью становится логин', async () => {
        authState.profile = {
            id: 7,
            username: 'admin',
            role: 'viewer',
            displayName: '   ',
            avatarUrl: null,
        };

        const wrapper = mountMenu();

        expect(wrapper.find('button').attributes('aria-label')).toContain('admin');

        await wrapper.find('button').trigger('click');
        expect(document.body.textContent).toContain('bricks.auth.roles.viewer');

        wrapper.unmount();
    });
});
