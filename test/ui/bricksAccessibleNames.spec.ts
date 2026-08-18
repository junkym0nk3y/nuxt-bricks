/**
 * @vitest-environment happy-dom
 *
 * Доступные имена у контролов кита, состоящих из одной иконки или из одного
 * значения.
 *
 * Что здесь сторожится:
 *
 * 1. Кнопка закрытия окна называет себя сама: внутри неё только иконка, а
 *    иконка имени не образует — без него единственный выход из модалки
 *    объявляется скринридером как безымянная «кнопка». Внешнее имя при этом
 *    остаётся возможным: атрибут перекрывает внутреннее значение.
 * 2. Селект подписывается ТОЛЬКО пропом: наследование атрибутов у него
 *    отключено, а корень — не DOM-узел, поэтому внешний `aria-label` до
 *    триггера не доходит вовсе. Без подписи скринридер читает текущее значение
 *    («Редактор»), но не назначение поля.
 */

// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Vue
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
// #endregion

// #region Mocks
vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));
// #endregion

import BricksCloseButton from '../../src/runtime/modules/ui/base/modal/BricksCloseButton.vue';
import BricksSelect from '../../src/runtime/modules/ui/inputs/BricksSelect.vue';

/** Глобальная иконка билдера регистрируется плагином приложения — здесь заглушка. */
const BricksIconStub = defineComponent({
    name: 'BricksIcon',
    props: { icon: { type: String, default: '' } },
    setup: (props) => () => h('i', { 'data-icon': props.icon }),
});

describe('BricksCloseButton: доступное имя', () => {
    it('без внешнего имени кнопка называет себя сама', () => {
        const wrapper = mount(BricksCloseButton, {
            global: { components: { BricksIcon: BricksIconStub } },
        });

        expect(wrapper.get('button').attributes('aria-label')).toBe('bricks.common.close');
    });

    it('внешнее имя перекрывает внутреннее', () => {
        const wrapper = mount(BricksCloseButton, {
            attrs: { 'aria-label': 'Закрыть галерею' },
            global: { components: { BricksIcon: BricksIconStub } },
        });

        expect(wrapper.get('button').attributes('aria-label')).toBe('Закрыть галерею');
    });
});

describe('BricksSelect: доступное имя', () => {
    it('подпись доезжает до триггера', () => {
        const wrapper = mount(BricksSelect, {
            props: {
                value: 'editor',
                specs: [{ label: 'Редактор', value: 'editor' }],
                facets: ['editor'],
                ariaLabel: 'Роль',
            },
        });

        expect(wrapper.get('button').attributes('aria-label')).toBe('Роль');
    });

    // Пустой `aria-label` имени не даёт, зато перебивает другие его источники,
    // поэтому неподписанный селект обязан остаться вовсе без атрибута
    it('без подписи атрибут не появляется вовсе', () => {
        const wrapper = mount(BricksSelect, {
            props: {
                value: 'editor',
                specs: [{ label: 'Редактор', value: 'editor' }],
                facets: ['editor'],
            },
        });

        expect(wrapper.get('button').attributes('aria-label')).toBeUndefined();
    });
});
