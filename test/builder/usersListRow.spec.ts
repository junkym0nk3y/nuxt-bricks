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
 * 4. Ключ убирает из строки только выключенная настройка `allowPasswordChange`
 *    (ручка в такой установке отвечает отказом), но НЕ деактивация учётки:
 *    пароль ей задают до открытия входа, а не после.
 * 5. Пока в разделе идёт операция, ни одна кнопка строки не выключается через
 *    `disabled`, а её действия не срабатывают: выключенная кнопка теряет фокус
 *    посреди запроса, а занятость общая на раздел — гасить надо и соседние
 *    строки, иначе их кнопки выглядят рабочими и молчат в ответ на клик.
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

import BricksIconButton from '../../src/runtime/modules/ui/base/icon-button/BricksIconButton.vue';
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

/**
 * Кнопка-действие строки как компонент — нужна там, где проверяется не разметка,
 * а то, что доехало до подсказки: содержимое подсказки живёт в портале и на
 * закрытой кнопке не смонтировано вовсе.
 *
 * @param wrapper - Обёртка теста.
 * @param icon - Ключ иконки.
 * @returns Обёртка компонента кнопки.
 */
function findActionComponentByIcon(wrapper: ReturnType<typeof mountRow>, icon: string) {
    const action = wrapper
        .findAllComponents(BricksIconButton)
        .find((button) => button.props('icon') === icon);

    if (!action) {
        throw new Error(`Кнопка с иконкой ${icon} в строке не найдена`);
    }

    return action;
}

/**
 * Пилюля роли. Отсутствие — ошибка, а не пустой результат: проверки её
 * атрибутов через `?.` прошли бы и на исчезнувшей кнопке.
 *
 * @param wrapper - Обёртка теста.
 * @returns Обёртка пилюли.
 */
function findRolePill(wrapper: ReturnType<typeof mountRow>) {
    const pill = wrapper
        .findAll('button')
        .find((button) => button.attributes('aria-label')?.startsWith('bricks.users.role'));

    if (!pill) {
        throw new Error('Пилюля роли в строке не найдена');
    }

    return pill;
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

            // Причина уходит в подсказку, а доступным именем остаётся само
            // действие — иначе кнопка перестаёт называть то, что делает
            const deactivateAction = findActionComponentByIcon(wrapper, 'ta:outline-user-off');

            expect(deactivateAction.props('hint')).toBe('bricks.users.row.locks.lastAdmin');
            expect(deactivate?.attributes('aria-label')).toBe(
                'bricks.users.row.deactivate:{"user":"anna.editor"}'
            );
        });
    });

    describe('деактивированная учётка', () => {
        it('включение вместо выключения, а ключ остаётся на месте', async () => {
            const wrapper = mountRow({ user: makeUser({ isActive: false }) });

            expect(findActionByIcon(wrapper, 'ta:outline-user-off')).toBeUndefined();

            await findActionByIcon(wrapper, 'ta:outline-user-check')?.trigger('click');

            expect(wrapper.emitted('activate')).toHaveLength(1);

            await findActionByIcon(wrapper, 'ta:outline-key')?.trigger('click');

            expect(wrapper.emitted('set-password')).toHaveLength(1);
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
    describe('пока идёт операция', () => {
        it('пилюля роли остаётся фокусируемой, а занятость объявляет строка', () => {
            const wrapper = mountRow({
                user: makeUser(),
                isPending: true,
                isOperationLocked: true,
            });
            const pill = findRolePill(wrapper);

            expect(pill.attributes('disabled')).toBeUndefined();
            expect(wrapper.attributes('aria-busy')).toBe('true');
        });

        // Одного `aria-disabled` мало: кликам он не мешает, и меню открылось бы
        // поверх чужой операции, а выбранная в нём роль была бы отброшена молча
        it('меню роли не открывается', async () => {
            const wrapper = mountRow({ user: makeUser(), isOperationLocked: true });
            const pill = findRolePill(wrapper);

            expect(pill.attributes('aria-disabled')).toBe('true');

            await pill.trigger('click');

            expect(pill.attributes('aria-expanded')).toBe('false');
            expect(document.body.querySelectorAll('[role="menu"]')).toHaveLength(0);
        });

        it('в свободном разделе то же меню открывается', async () => {
            const wrapper = mountRow({ user: makeUser() });
            const pill = findRolePill(wrapper);

            await pill.trigger('click');

            expect(pill.attributes('aria-expanded')).toBe('true');
        });

        // Тот же дефект, что у пилюли: включение входа применяется сразу, и
        // выключенная на время запроса кнопка теряет фокус — человек с
        // клавиатуры оказывается в начале страницы
        it('кнопки действий не выключаются, а объявляются недоступными', () => {
            const wrapper = mountRow({
                user: makeUser(),
                isPending: true,
                isOperationLocked: true,
            });

            const actions = [
                findActionByIcon(wrapper, 'ta:outline-key'),
                findActionByIcon(wrapper, 'ta:outline-user-off'),
                findActionByIcon(wrapper, 'ta:outline-trash'),
            ];

            actions.forEach((action) => {
                expect(action?.attributes('disabled')).toBeUndefined();
                expect(action?.attributes('aria-disabled')).toBe('true');
            });
        });

        // Занятость общая на раздел, поэтому гасятся действия и той строки, над
        // которой операция НЕ идёт: иначе её кнопки выглядят рабочими, а клик по
        // ним молча ничего не делает
        it('действия соседней строки не срабатывают', async () => {
            const wrapper = mountRow({ user: makeUser(), isOperationLocked: true });

            await findActionByIcon(wrapper, 'ta:outline-key')?.trigger('click');
            await findActionByIcon(wrapper, 'ta:outline-user-off')?.trigger('click');
            await findActionByIcon(wrapper, 'ta:outline-trash')?.trigger('click');

            expect(wrapper.emitted('set-password')).toBeUndefined();
            expect(wrapper.emitted('deactivate')).toBeUndefined();
            expect(wrapper.emitted('delete')).toBeUndefined();
            expect(wrapper.attributes('aria-busy')).toBe('false');
        });
    });

    /*
        Плашки строки после переезда на кит: статус и роль рисует `BricksBadge`, и
        проверить их вживую под учёткой редактора нечем — раздел учёток закрыт
        правом `canManageUsers`.
    */
    describe('плашки строки', () => {
        it('статус объявлен подписью и точкой, а не одним цветом', () => {
            const active = mountRow({ user: makeUser({ isActive: true }) });
            const inactive = mountRow({ user: makeUser({ isActive: false }) });

            expect(active.text()).toContain('bricks.users.status.active');
            expect(inactive.text()).toContain('bricks.users.status.inactive');

            // Точка — часть плашки: тон у активной и выключенной учётки разный
            const activeDot = active.find('[class*="_dot-"]');
            const inactiveDot = inactive.find('[class*="_dot-"]');

            expect(activeDot.exists()).toBe(true);
            expect(inactiveDot.exists()).toBe(true);
            expect(activeDot.classes().join(' ')).not.toBe(inactiveDot.classes().join(' '));
        });

        /*
            Тон проверяется по имени, а не «лишь бы отличался»: набор ролей — это
            шкала «насколько выделять», и подмена тона на соседний по шкале
            (например `muted` вместо `accent` у администратора) прошла бы
            проверку на различие. Сами цвета живут в ките: у `muted` подпись
            `base-600`, потому что `base-500` давал на `base-100` 4.4:1.
        */
        it.each([
            ['admin', 'accent'],
            ['editor', 'muted'],
            ['viewer', 'quiet'],
        ] as const)('роль %s носит тон %s', (role, tone) => {
            const pill = findRolePill(mountRow({ user: makeUser({ role }) }));
            const tones = pill
                .classes()
                .filter((name) => /^__(primary|neutral|muted|accent|quiet|plain)_/.test(name));

            expect(tones).toHaveLength(1);
            expect(tones[0]).toMatch(new RegExp(`^__${tone}_`));
        });
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
