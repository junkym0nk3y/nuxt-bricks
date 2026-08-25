/**
 * @vitest-environment happy-dom
 *
 * Кнопка-действие из одного глифа.
 *
 * Что здесь сторожится:
 *
 * 1. Иконка имени не образует: без подписи ряд одинаковых квадратов объявляется
 *    скринридером как несколько безымянных «кнопок».
 * 2. Гашений два, и они не взаимозаменяемы. `disabled` уносит кнопку из обхода с
 *    клавиатуры вместе с причиной запрета и теряет фокус посреди операции;
 *    `muted` оставляет кнопку фокусируемой и гасит только клик. Ошибиться местами
 *    легко, а разница видна лишь с клавиатуры — то есть не видна вовсе.
 * 3. `aria-pressed` появляется ТОЛЬКО у переключателя. Поставленный по умолчанию,
 *    он объявил бы нажимаемым каждое обычное действие — «удалить» в том числе.
 * 4. Подсказка объясняет причину запрета, но доступным именем остаётся действие:
 *    подменив имя причиной, кнопка перестаёт называть то, что делает.
 */

// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Vue
import { defineComponent, h, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
// #endregion

import BricksIconButton from '../../src/runtime/modules/ui/base/icon-button/BricksIconButton.vue';
import BricksTooltipHint from '../../src/runtime/modules/ui/base/tooltip/BricksTooltipHint.vue';

/** Глобальная иконка билдера регистрируется плагином приложения — здесь заглушка. */
const BricksIconStub = defineComponent({
    name: 'BricksIcon',
    props: { icon: { type: String, default: '' } },
    setup: (props) => () => h('i', { 'data-icon': props.icon }),
});

/**
 * Монтирует кнопку.
 *
 * @param props - Пропы кнопки.
 * @returns Обёртка теста.
 */
function mountButton(props: Record<string, unknown> = {}) {
    return mount(BricksIconButton, {
        props: { icon: 'ta:outline-trash', label: 'Удалить страницу', ...props },
        attachTo: document.body,
        global: { components: { BricksIcon: BricksIconStub } },
    });
}

/**
 * Открывает подсказку и отдаёт её текст.
 *
 * Содержимое подсказки живёт в портале и до открытия не смонтировано, поэтому
 * прочитать его на закрытой кнопке нельзя. Открытие — фокусом, а не наведением:
 * задержки у фокуса нет, и тест не зависит от таймеров.
 *
 * @param wrapper - Обёртка теста.
 * @returns Текст подсказки.
 */
async function readTooltipText(wrapper: ReturnType<typeof mountButton>): Promise<string> {
    await wrapper.get('div').trigger('focus');
    await nextTick();

    return wrapper.getComponent(BricksTooltipHint).props('text');
}

describe('BricksIconButton: имя и подсказка', () => {
    it('подпись становится доступным именем', () => {
        const wrapper = mountButton();

        expect(wrapper.get('button').attributes('aria-label')).toBe('Удалить страницу');
    });

    // Содержимое подсказки уезжает в портал и доступным именем не становится,
    // поэтому имя обязано остаться на самой кнопке
    it('причина запрета уходит в подсказку, а имя остаётся действием', async () => {
        const wrapper = mountButton({
            muted: true,
            hint: 'Нельзя удалить последнего администратора',
        });

        expect(wrapper.get('button').attributes('aria-label')).toBe('Удалить страницу');
        expect(await readTooltipText(wrapper)).toBe('Нельзя удалить последнего администратора');
    });

    it('без отдельной причины подсказка повторяет действие', async () => {
        expect(await readTooltipText(mountButton())).toBe('Удалить страницу');
    });

    // Нативный `title` рядом с настоящей подсказкой дал бы вторую поверх первой,
    // со своей задержкой и своим оформлением
    it('нативной подсказки браузера не остаётся', () => {
        expect(mountButton().get('button').attributes('title')).toBeUndefined();
    });
});

describe('BricksIconButton: гашение', () => {
    it('запрет с причиной оставляет кнопку в обходе с клавиатуры', async () => {
        const wrapper = mountButton({ muted: true });
        const button = wrapper.get('button');

        expect(button.attributes('aria-disabled')).toBe('true');
        expect(button.attributes('disabled')).toBeUndefined();

        await button.trigger('click');

        expect(wrapper.emitted('click')).toBeUndefined();
    });

    it('обычный запрет выключает кнопку', async () => {
        const wrapper = mountButton({ disabled: true });
        const button = wrapper.get('button');

        expect(button.attributes('disabled')).toBeDefined();
        expect(button.attributes('aria-disabled')).toBeUndefined();

        await button.trigger('click');

        expect(wrapper.emitted('click')).toBeUndefined();
    });

    it('доступная кнопка отдаёт клик наружу', async () => {
        const wrapper = mountButton();

        await wrapper.get('button').trigger('click');

        expect(wrapper.emitted('click')).toHaveLength(1);
    });
});

describe('BricksIconButton: переключатель', () => {
    it('обычное действие нажимаемым не объявляется', () => {
        expect(mountButton().get('button').attributes('aria-pressed')).toBeUndefined();
    });

    it('отжатый переключатель объявляет своё состояние, а не молчит', () => {
        expect(mountButton({ active: false }).get('button').attributes('aria-pressed')).toBe(
            'false'
        );
    });

    it('нажатый переключатель объявлен нажатым', () => {
        expect(mountButton({ active: true }).get('button').attributes('aria-pressed')).toBe('true');
    });
});

describe('BricksIconButton: место в порядке табуляции', () => {
    it('без пропа атрибута нет — кнопка стоит в порядке документа', () => {
        expect(mountButton().get('button').attributes('tabindex')).toBeUndefined();
    });

    it('кнопка неактивной ячейки уносится из обхода с клавиатуры', () => {
        expect(mountButton({ tabIndex: -1 }).get('button').attributes('tabindex')).toBe('-1');
    });

    it('кнопка активной ячейки остаётся в обходе', () => {
        expect(mountButton({ tabIndex: 0 }).get('button').attributes('tabindex')).toBe('0');
    });
});
