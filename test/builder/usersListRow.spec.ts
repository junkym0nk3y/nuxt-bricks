/**
 * @vitest-environment happy-dom
 *
 * Строка учётки: чем различаются своя строка, последний активный администратор и
 * деактивированная учётка.
 *
 * Что здесь сторожится:
 *
 * 1. Себя нельзя ни лишить входа, ни удалить: интерфейс не должен предлагать
 *    операцию, которой сервер отказывает (409 `SELF_TARGET_FORBIDDEN`), — иначе
 *    один клик отнимает доступ у того, кто его выдаёт.
 * 2. Свой пароль из своей строки меняется формой ПРОФИЛЯ: админская ручка чужого
 *    пароля текущий не спрашивает и на своей учётке отказывает намеренно.
 * 3. Замок последнего активного администратора стоит на пилюле роли и на
 *    операциях состояния, но кнопки остаются в обходе с клавиатуры: причина
 *    запрета — единственное, что человеку здесь нужно.
 * 4. Выключенная настройка `allowPasswordChange` убирает ключ из строки: ручка в
 *    такой установке отвечает отказом.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Types
import type { IBricksUserSummary } from '../../src/runtime/modules/common/types/auth';

// Vue
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
// #endregion

// #region Mocks
const { permissions } = vi.hoisted(() => ({
    permissions: { canChangePassword: true },
}));

vi.mock('../../src/runtime/modules/builder/core/composables/useBuilderPermissions', () => ({
    useBuilderPermissions: () => ({
        canChangePassword: { value: permissions.canChangePassword },
    }),
}));

vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        t: (key: string, params?: Record<string, unknown>) =>
            params && Object.keys(params).length > 0 ? `${key}:${JSON.stringify(params)}` : key,
    }),
}));
// #endregion

import BuilderUsersListRow from '../../src/runtime/modules/builder/users/components/BuilderUsersListRow.vue';

/** Глобальная иконка билдера регистрируется плагином приложения — здесь заглушка. */
const BricksIconStub = defineComponent({
    name: 'BricksIcon',
    props: { icon: { type: String, default: '' } },
    setup: (props) => () => h('i', { 'data-icon': props.icon }),
});

/**
 * Учётка строки.
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
 * Монтирует строку.
 *
 * @param props - Пропы строки.
 * @returns Обёртка теста.
 */
function mountRow(props: Record<string, unknown> = {}) {
    return mount(BuilderUsersListRow, {
        props: { user: makeUser(), ...props },
        global: { components: { BricksIcon: BricksIconStub } },
    });
}

/**
 * Кнопка строки по иконке.
 *
 * @param wrapper - Обёртка теста.
 * @param icon - Ключ иконки.
 * @returns Обёртка кнопки.
 */
function findActionByIcon(wrapper: ReturnType<typeof mountRow>, icon: string) {
    return wrapper
        .findAll('button')
        .find((button) => button.find(`[data-icon="${icon}"]`).exists());
}

describe('BuilderUsersListRow: строка учётки', () => {
    beforeEach(() => {
        permissions.canChangePassword = true;
    });

    it('имя без отображаемого — логин, и второй раз он не повторяется', () => {
        const wrapper = mountRow({ user: makeUser() });

        expect(wrapper.text()).toContain('anna.editor');
        expect(wrapper.text().match(/anna\.editor/g)).toHaveLength(1);
    });

    it('отображаемое имя показывается вместе с логином', () => {
        const wrapper = mountRow({ user: makeUser({ displayName: 'Анна Ким' }) });

        expect(wrapper.text()).toContain('Анна Ким');
        expect(wrapper.text()).toContain('anna.editor');
    });

    it('учётка без входов помечена отдельным текстом, а не пустой датой', () => {
        const wrapper = mountRow({ user: makeUser() });

        expect(wrapper.text()).toContain('bricks.users.row.neverLoggedIn');
    });

    describe('своя строка', () => {
        it('помечена, а вход и удаление в ней недоступны', () => {
            const wrapper = mountRow({ user: makeUser(), isCurrentUser: true });

            expect(wrapper.text()).toContain('bricks.users.row.you');

            const deactivate = findActionByIcon(wrapper, 'ta:outline-user-off');
            const remove = findActionByIcon(wrapper, 'ta:outline-trash');

            expect(deactivate?.attributes('aria-disabled')).toBe('true');
            expect(remove?.attributes('aria-disabled')).toBe('true');

            deactivate?.trigger('click');
            remove?.trigger('click');

            expect(wrapper.emitted('deactivate')).toBeUndefined();
            expect(wrapper.emitted('delete')).toBeUndefined();
        });

        it('ключ ведёт в свою форму пароля, а не в админскую', async () => {
            const wrapper = mountRow({ user: makeUser(), isCurrentUser: true });

            await findActionByIcon(wrapper, 'ta:outline-key')?.trigger('click');

            expect(wrapper.emitted('change-own-password')).toHaveLength(1);
            expect(wrapper.emitted('set-password')).toBeUndefined();
        });

        it('своя роль не меняется — у пилюли замок вместо меню', () => {
            const wrapper = mountRow({ user: makeUser(), isCurrentUser: true });

            expect(wrapper.find('[data-icon="ta:outline-lock"]').exists()).toBe(true);
            expect(wrapper.find('[data-icon="ta:outline-chevron-down"]').exists()).toBe(false);
        });
    });

    describe('последний активный администратор', () => {
        it('роль под замком, состояние закрыто, кнопки остаются фокусируемыми', () => {
            const wrapper = mountRow({
                user: makeUser({ role: 'admin' }),
                isLastActiveAdmin: true,
            });

            expect(wrapper.find('[data-icon="ta:outline-lock"]').exists()).toBe(true);

            const deactivate = findActionByIcon(wrapper, 'ta:outline-user-off');

            expect(deactivate?.attributes('aria-disabled')).toBe('true');
            // Не `disabled`: выключенная кнопка уносит из обхода клавиатуры
            // причину запрета, а она здесь и есть содержание
            expect(deactivate?.attributes('disabled')).toBeUndefined();
            expect(deactivate?.attributes('title')).toBe('bricks.users.row.locks.lastAdmin');
        });
    });

    describe('деактивированная учётка', () => {
        it('вместо ключа и выключения — включение входа', async () => {
            const wrapper = mountRow({ user: makeUser({ isActive: false }) });

            expect(findActionByIcon(wrapper, 'ta:outline-key')).toBeUndefined();
            expect(findActionByIcon(wrapper, 'ta:outline-user-off')).toBeUndefined();

            await findActionByIcon(wrapper, 'ta:outline-user-check')?.trigger('click');

            expect(wrapper.emitted('activate')).toHaveLength(1);
        });
    });

    it('выключенная настройкой смена пароля убирает ключ из строки', () => {
        permissions.canChangePassword = false;

        const wrapper = mountRow({ user: makeUser() });

        expect(findActionByIcon(wrapper, 'ta:outline-key')).toBeUndefined();
    });

    // Найдено живой проверкой: выключенный на время запроса триггер меню выпадает
    // из обхода, Reka не может вернуть на него фокус, и человек, сменивший роль с
    // клавиатуры, оказывается в начале страницы
    it('пилюля роли остаётся фокусируемой во время запроса', () => {
        const wrapper = mountRow({ user: makeUser(), isPending: true });
        const pill = wrapper
            .findAll('button')
            .find((button) => button.attributes('aria-label')?.startsWith('bricks.users.role'));

        expect(pill?.attributes('disabled')).toBeUndefined();
        expect(pill?.attributes('aria-busy')).toBe('true');
    });

    it('доступные действия чужой строки уходят наверх событиями', async () => {
        const wrapper = mountRow({ user: makeUser() });

        await findActionByIcon(wrapper, 'ta:outline-key')?.trigger('click');
        await findActionByIcon(wrapper, 'ta:outline-user-off')?.trigger('click');
        await findActionByIcon(wrapper, 'ta:outline-trash')?.trigger('click');

        expect(wrapper.emitted('set-password')).toHaveLength(1);
        expect(wrapper.emitted('deactivate')).toHaveLength(1);
        expect(wrapper.emitted('delete')).toHaveLength(1);
    });
});
