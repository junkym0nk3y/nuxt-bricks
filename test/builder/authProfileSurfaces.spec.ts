/**
 * @vitest-environment happy-dom
 *
 * Две поверхности аватара: шапка дашборда и тулбар билдера.
 *
 * Смысл этой спеки — не разметка, а закрытая дыра: до профиля выход жил ТОЛЬКО в
 * футере рейла дашборда, то есть из редактора выйти было нельзя вовсе. Аватар в
 * тулбаре это исправил, и без спеки дыра вернулась бы молча при следующей правке
 * тулбара — вместе с «Выйти», которое из рейла ушло.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { defineComponent, computed, h } from 'vue';
import { mount } from '@vue/test-utils';
// #endregion

// #region Mocks
vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        t: (key: string) => key,
        locale: computed(() => 'ru'),
    }),
}));

vi.mock('../../src/runtime/modules/common/composables/useBricksRoutePaths', () => ({
    useBricksRoutePaths: () => ({
        builderRootPath: '/bricks',
        builderLoginPath: '/bricks/bricks-login',
        withBase: (path: string) => path,
    }),
}));

vi.mock('../../src/runtime/modules/builder/core/composables/useBuilderPermissions', async () => {
    const { computed: computedRef } = await import('vue');

    return {
        useBuilderPermissions: () => ({
            role: computedRef(() => 'admin'),
            isRoleKnown: computedRef(() => true),
            canEdit: computedRef(() => true),
            canDelete: computedRef(() => true),
            canManageUsers: computedRef(() => true),
            canChangePassword: computedRef(() => true),
            ensureRole: vi.fn(),
        }),
    };
});
// #endregion

import BuilderAuthProfileMenu from '../../src/runtime/modules/builder/auth/components/BuilderAuthProfileMenu.vue';
import BuilderPublishDashboardNav from '../../src/runtime/modules/builder/publish/components/BuilderPublishDashboardNav.vue';
import TheBuilderPublishDashboard from '../../src/runtime/modules/builder/publish/components/TheBuilderPublishDashboard.vue';
import TheBuilderShellToolbar from '../../src/runtime/modules/builder/shell/toolbar/components/TheBuilderShellToolbar.vue';

/** Глобальная иконка билдера регистрируется плагином приложения. */
const BricksIconStub = defineComponent({
    name: 'BricksIcon',
    props: { icon: { type: String, default: '' } },
    setup: (props) => () => h('i', { 'data-icon': props.icon }),
});

describe('Тулбар билдера: выход появился там, где его не было', () => {
    let wrapper: ReturnType<typeof mount>;

    beforeEach(() => {
        wrapper = mount(TheBuilderShellToolbar, {
            props: {
                isEditingExistingPage: false,
                isSubmittingPublish: false,
                hasSelectedComponent: false,
                isPublishSettingsComplete: true,
                isSessionReady: true,
            },
            shallow: true,
            global: { components: { BricksIcon: BricksIconStub } },
        });
    });

    it('меню профиля стоит в правой группе панели', () => {
        expect(wrapper.findComponent(BuilderAuthProfileMenu).exists()).toBe(true);
    });

    it('выход и открытие профиля уходят наверх — сессией владеет composition root', () => {
        const menu = wrapper.findComponent(BuilderAuthProfileMenu);

        menu.vm.$emit('logout');
        menu.vm.$emit('open-profile');

        expect(wrapper.emitted('logout')).toHaveLength(1);
        expect(wrapper.emitted('openProfile')).toHaveLength(1);
    });
});

describe('Шапка дашборда: аватар вместо пункта рейла', () => {
    it('меню профиля стоит в шапке и пробрасывает события наверх', () => {
        const wrapper = mount(TheBuilderPublishDashboard, {
            props: {
                activeSection: 'pages',
                searchQuery: '',
                pagesCount: 0,
                isDarkMode: false,
            },
            shallow: true,
            global: { components: { BricksIcon: BricksIconStub } },
        });
        const menu = wrapper.findComponent(BuilderAuthProfileMenu);

        expect(menu.exists()).toBe(true);

        menu.vm.$emit('logout');
        menu.vm.$emit('open-profile');

        expect(wrapper.emitted('logout')).toHaveLength(1);
        expect(wrapper.emitted('open-profile')).toHaveLength(1);
    });

    // «Выйти» ушло из футера рейла вместе с пропом `is-logout-visible`: два входа
    // в один и тот же выход — это два места, где он может разъехаться
    it('в футере рейла кнопки выхода больше нет', () => {
        const wrapper = mount(BuilderPublishDashboardNav, {
            props: {
                activeSection: 'pages',
                pagesCount: 0,
                locale: 'ru',
                isDarkMode: false,
            },
            global: { components: { BricksIcon: BricksIconStub } },
        });

        expect(wrapper.text()).not.toContain('bricks.auth.logout');
        expect(wrapper.find('[data-icon="ta:outline-logout"]').exists()).toBe(false);
    });
});
