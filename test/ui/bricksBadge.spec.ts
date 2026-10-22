/**
 * @vitest-environment happy-dom
 *
 * Плашка кита после того, как в неё съехались пять рукописных реализаций.
 *
 * Что здесь сторожится:
 *
 * 1. Точка статуса — часть плашки, а не отдельный `statusDot` в каждой строке.
 *    Пока она была своей, в списке страниц статус держался на одном цвете.
 * 2. Плашка бывает кнопкой: пилюля роли в строке учётки — триггер меню, и её
 *    оболочка обязана приходить из кита, иначе геометрия пилюли снова разъедется.
 *    У кнопки обязателен `type="button"` — без него она сабмитит форму, в которой
 *    стоит.
 * 3. Тон `plain` снимает паддинг парой классов, а не одиночным: с одиночным
 *    исход зависел бы от порядка правил в файле.
 */

// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Vue
import { mount } from '@vue/test-utils';
// #endregion

import BricksBadge from '../../src/runtime/modules/ui/base/badge/BricksBadge.vue';

describe('BricksBadge', () => {
    it('по умолчанию — span без точки', () => {
        const wrapper = mount(BricksBadge, { slots: { default: 'Черновик' } });

        expect(wrapper.element.tagName).toBe('SPAN');
        expect(wrapper.element.children).toHaveLength(0);
        expect(wrapper.text()).toBe('Черновик');
    });

    it('точка статуса рисуется своим тоном', () => {
        const wrapper = mount(BricksBadge, {
            props: { tone: 'plain', dot: 'positive' },
            slots: { default: 'Активна' },
        });
        const dot = wrapper.element.children[0];

        expect(dot).toBeDefined();
        expect(dot?.className).toMatch(/_dot-positive/);
    });

    it('as="button" даёт кнопку с явным type', () => {
        const wrapper = mount(BricksBadge, {
            props: { as: 'button', shape: 'pill', tone: 'accent' },
            slots: { default: 'Администратор' },
        });

        expect(wrapper.element.tagName).toBe('BUTTON');
        expect(wrapper.attributes('type')).toBe('button');
        expect(wrapper.classes().join(' ')).toMatch(/_accent/);
    });

    it('span не получает type', () => {
        const wrapper = mount(BricksBadge);

        expect(wrapper.attributes('type')).toBeUndefined();
    });

    it('внешние атрибуты доезжают до корня — плашке дают имя как графике', () => {
        const wrapper = mount(BricksBadge, {
            props: { tone: 'plain', dot: 'neutral' },
            attrs: { role: 'img', 'aria-label': 'Черновик' },
        });

        expect(wrapper.attributes('role')).toBe('img');
        expect(wrapper.attributes('aria-label')).toBe('Черновик');
    });
});
