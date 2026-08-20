/**
 * @vitest-environment happy-dom
 *
 * Плавающая поверхность: одна и та же роль была написана тринадцать раз и уже
 * разъехалась по тени (`sm` / `md` / `lg`).
 *
 * Что здесь сторожится:
 *
 * 1. Поверхность — ОДИН узел, принимающий атрибуты снаружи. На этом стоит вся
 *    схема составления с reka: `as-child` кладёт позиционирование, `data-state`
 *    и роль на тот же элемент, где стоит класс вызывающего. Появись у
 *    компонента обёртка — анимации, висящие на `data-state`, начали бы
 *    анимировать не то, что видно.
 * 2. Плотность, тень и слой приезжают классами, а не инлайном: вызывающий
 *    перекрывает геометрию своим классом, и инлайновые значения перекрыть было
 *    бы нечем.
 * 3. `layer="none"` не печатает `z-index` вовсе — иначе поверхность внутри
 *    reka-контента спорила бы со слоем, который ставит сама reka.
 */

// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Vue
import { defineComponent, nextTick } from 'vue';
import { mount } from '@vue/test-utils';

// Reka UI
import { DropdownMenuContent, DropdownMenuPortal, DropdownMenuRoot } from 'reka-ui';
// #endregion

import BricksPopoverSurface from '../../src/runtime/modules/ui/base/popover/BricksPopoverSurface.vue';

describe('BricksPopoverSurface', () => {
    it('корень один и принимает атрибуты снаружи', () => {
        const wrapper = mount(BricksPopoverSurface, {
            attrs: { 'data-state': 'open', role: 'listbox' },
            slots: { default: '<span>пункт</span>' },
        });

        expect(wrapper.element.tagName).toBe('DIV');
        expect(wrapper.attributes('data-state')).toBe('open');
        expect(wrapper.attributes('role')).toBe('listbox');
        expect(wrapper.text()).toBe('пункт');
    });

    it('плотность, тень и слой — классами', () => {
        const wrapper = mount(BricksPopoverSurface, {
            props: { density: 'compact', elevation: 'sm', layer: 'local' },
        });
        const classes = wrapper.classes().join(' ');

        expect(classes).toMatch(/_compact/);
        expect(classes).toMatch(/_sm/);
        expect(classes).toMatch(/_layer-local/);
        expect(wrapper.attributes('style')).toBeUndefined();
    });

    it('layer="none" не печатает слой вовсе', () => {
        const wrapper = mount(BricksPopoverSurface, { props: { layer: 'none' } });

        expect(wrapper.classes().join(' ')).not.toMatch(/_layer-/);
    });

    it('составляется с контентом reka через as-child одним узлом', async () => {
        mount(
            defineComponent({
                components: {
                    BricksPopoverSurface,
                    DropdownMenuContent,
                    DropdownMenuPortal,
                    DropdownMenuRoot,
                },
                template: `
                    <DropdownMenuRoot :open="true">
                        <DropdownMenuPortal>
                            <DropdownMenuContent as-child>
                                <BricksPopoverSurface class="probe" />
                            </DropdownMenuContent>
                        </DropdownMenuPortal>
                    </DropdownMenuRoot>
                `,
            }),
            { attachTo: document.body }
        );

        await nextTick();
        await nextTick();

        const surface = document.querySelector('.probe');

        expect(surface).not.toBeNull();

        // Роль и состояние reka — на том же узле, что класс и вид поверхности
        expect(surface?.getAttribute('role')).toBe('menu');
        expect(surface?.getAttribute('data-state')).toBe('open');
        expect(surface?.className).toMatch(/BricksPopoverSurface/);

        document.body.innerHTML = '';
    });
});
