/**
 * @vitest-environment happy-dom
 *
 * Гейты раздела «Пользователи» в оболочке дашборда.
 *
 * Что здесь сторожится:
 *
 * 1. Пункт рейла есть только у роли с правом управления учётками И в установке,
 *    где ручки отвечают: 403 и 404 означают, что раздела нет вовсе, и оставленный
 *    пункт вёл бы на пустой экран.
 * 2. Счётчик до готовности списка не рисуется: ноль на его месте читался бы как
 *    «учёток нет», чего не бывает — кто-то же вошёл.
 * 3. Первичная кнопка шапки принадлежит разделу: в страницах она создаёт
 *    страницу, в учётках — учётку, в шаблонах её нет вовсе.
 * 4. Раздел учёток рисуется в своём слоте, а не в ветке шаблонов: до появления
 *    третьего раздела `v-else` совпадал со «шаблонами» случайно.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Types
import type { TBricksUserRole } from '../../src/runtime/modules/common/types/auth';

// Vue
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
// #endregion

// #region Mocks
const { requestContext } = vi.hoisted(() => ({
    requestContext: { role: 'admin' as TBricksUserRole },
}));

vi.mock('#imports', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();

    return {
        ...actual,
        useRuntimeConfig: () => ({ public: { bricksAuthMode: 'database' } }),
        // Пользователь запроса полный: из него оболочка берёт и роль (права), и
        // профиль для аватара в углу — половинчатый контекст ронял бы монтаж на
        // подписи аватара, а не на проверяемом гейте
        useRequestEvent: () => ({
            context: {
                bricksUser: {
                    id: 1,
                    username: 'admin',
                    role: requestContext.role,
                    displayName: null,
                    avatarUrl: null,
                },
            },
        }),
    };
});

// Локаль отдаётся настоящим `ref`: оболочка передаёт её пропом в рейл, а тот
// зовёт на ней строковый метод — подделка объектом ломала бы шаблон, а не гейт
vi.mock('vue-i18n', async () => {
    const { ref } = await import('vue');

    return { useI18n: () => ({ t: (key: string) => key, locale: ref('ru') }) };
});

// Оболочка тянет меню профиля, а оно — клиент API: в тестах `$fetch` глобально
// не существует, и без мока падал бы сам монтаж, а не проверяемые гейты
vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: vi.fn() }),
}));
// #endregion

import BuilderPublishDashboardNav from '../../src/runtime/modules/builder/publish/components/BuilderPublishDashboardNav.vue';
import TheBuilderPublishDashboard from '../../src/runtime/modules/builder/publish/components/TheBuilderPublishDashboard.vue';
import { resetNuxtStateStub } from '../stubs/nuxt-imports';

/** Глобальная иконка билдера регистрируется плагином приложения — здесь заглушка. */
const BricksIconStub = defineComponent({
    name: 'BricksIcon',
    props: { icon: { type: String, default: '' } },
    setup: (props) => () => h('i', { 'data-icon': props.icon }),
});

/**
 * Монтирует рейл дашборда.
 *
 * @param props - Пропы, отличающиеся от дефолтных.
 * @returns Обёртка теста.
 */
function mountNav(props: Record<string, unknown> = {}) {
    return mount(BuilderPublishDashboardNav, {
        props: {
            activeSection: 'pages',
            pagesCount: 4,
            templatesCount: null,
            usersCount: null,
            mediaCount: null,
            isUsersSectionVisible: true,
            locale: 'ru',
            isDarkMode: false,
            ...props,
        },
        global: { components: { BricksIcon: BricksIconStub } },
    });
}

/**
 * Монтирует оболочку дашборда со слотами разделов.
 *
 * @param props - Пропы, отличающиеся от дефолтных.
 * @returns Обёртка теста.
 */
function mountDashboard(props: Record<string, unknown> = {}) {
    return mount(TheBuilderPublishDashboard, {
        props: {
            activeSection: 'pages',
            searchQuery: '',
            pagesCount: 4,
            templatesCount: null,
            usersCount: 5,
            mediaCount: null,
            isUsersSectionVisible: true,
            isDarkMode: false,
            ...props,
        },
        slots: {
            list: () => h('div', { 'data-slot': 'list' }),
            users: () => h('div', { 'data-slot': 'users' }),
            templates: () => h('div', { 'data-slot': 'templates' }),
        },
        global: { components: { BricksIcon: BricksIconStub } },
    });
}

describe('Раздел «Пользователи» в рейле дашборда', () => {
    beforeEach(() => {
        requestContext.role = 'admin';
        resetNuxtStateStub();
    });

    it('пункт есть у администратора, когда раздел доступен', () => {
        const wrapper = mountNav({ isUsersSectionVisible: true });

        expect(wrapper.text()).toContain('bricks.publish.dashboard.nav.users');
        expect(wrapper.find('[data-icon="ta:outline-users"]').exists()).toBe(true);
    });

    it('недоступный раздел пункта не оставляет', () => {
        const wrapper = mountNav({ isUsersSectionVisible: false });

        expect(wrapper.text()).not.toContain('bricks.publish.dashboard.nav.users');
    });

    it('счётчик учёток появляется только с прочитанным списком', () => {
        const unknownCount = mountNav({ usersCount: null });
        const knownCount = mountNav({ usersCount: 5 });

        expect(unknownCount.text()).not.toContain('5');
        expect(knownCount.text()).toContain('5');
    });
});

describe('Оболочка дашборда: раздел решает, что в шапке и в теле', () => {
    beforeEach(() => {
        requestContext.role = 'admin';
        resetNuxtStateStub();
    });

    it('в страницах шапка предлагает создать страницу', () => {
        const wrapper = mountDashboard({ activeSection: 'pages' });

        expect(wrapper.text()).toContain('bricks.publish.dashboard.createPage');
        expect(wrapper.text()).not.toContain('bricks.users.createUser');
    });

    it('в учётках шапка предлагает создать пользователя', async () => {
        const wrapper = mountDashboard({ activeSection: 'users' });

        expect(wrapper.text()).toContain('bricks.users.createUser');
        expect(wrapper.text()).not.toContain('bricks.publish.dashboard.createPage');

        const buttons = wrapper.findAll('button');
        const createUser = buttons.find((button) =>
            button.text().includes('bricks.users.createUser')
        );

        await createUser?.trigger('click');

        expect(wrapper.emitted('create-user')).toHaveLength(1);
    });

    it('в шаблонах первичной кнопки нет', () => {
        const wrapper = mountDashboard({ activeSection: 'templates' });

        expect(wrapper.text()).not.toContain('bricks.users.createUser');
        expect(wrapper.text()).not.toContain('bricks.publish.dashboard.createPage');
    });

    it('раздел учёток рисует свой слот, а не слот другого раздела', () => {
        const wrapper = mountDashboard({ activeSection: 'users' });

        expect(wrapper.find('[data-slot="users"]').exists()).toBe(true);
        expect(wrapper.find('[data-slot="list"]').exists()).toBe(false);
        expect(wrapper.find('[data-slot="templates"]').exists()).toBe(false);
    });

    // Роль без права управления учётками не должна получить кнопку создания даже
    // при открытом разделе: гард по роли обязан быть виден в интерфейсе
    it('редактор в разделе учёток кнопки создания не получает', () => {
        requestContext.role = 'editor';

        const wrapper = mountDashboard({ activeSection: 'users', isUsersSectionVisible: false });

        expect(wrapper.text()).not.toContain('bricks.users.createUser');
    });
});
