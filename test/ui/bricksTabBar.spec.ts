/**
 * @vitest-environment happy-dom
 *
 * DOM-окружение включено только для этого файла: остальные тесты проекта живут в
 * node-окружении, и глобальный `window` им не нужен.
 */

// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Types
import type {
    IBricksTabBarProps,
    IBricksTabItem,
} from '../../src/runtime/modules/ui/base/tabs/types.d.ts';

// Vue
import { defineComponent, h, nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';

// Components
import BricksTabBar from '../../src/runtime/modules/ui/base/tabs/BricksTabBar.vue';
// #endregion

// #region Helpers
/** BricksIcon приходит из auto-import Nuxt — вне приложения его нужно подменить. */
const BricksIconStub = defineComponent({
    name: 'BricksIcon',
    props: { icon: { type: String, default: '' } },
    setup: (props) => () => h('i', { 'data-icon': props.icon }),
});

const ITEMS: IBricksTabItem[] = [
    { value: 'all', label: 'Все', count: 7 },
    { value: 'published', label: 'Опубликованные', count: 4 },
    { value: 'drafts', label: 'Черновики', count: 3 },
];

/**
 * Монтирует таб-бар в DOM. Реальный документ нужен и для клавиатуры: roving
 * tabindex reka работает через фокус, а без документа фокусу некуда встать.
 *
 * @param overrides - Пропсы, переопределяющие дефолты.
 */
function mountTabBar(overrides: Partial<IBricksTabBarProps> = {}): VueWrapper {
    return mount(BricksTabBar, {
        attachTo: document.body,
        props: {
            modelValue: 'all',
            items: ITEMS,
            groupLabel: 'Фильтр страниц',
            ...overrides,
        },
        global: { components: { BricksIcon: BricksIconStub } },
    });
}

/**
 * Отдаёт кнопки-переключатели группы в порядке разметки.
 *
 * Отбор идёт по атрибуту коллекции reka, а не по тегу: рядом с переключателем
 * может стоять кнопка действия потребителя, и `querySelectorAll('button')` после
 * этого перестаёт отличать одно от другого.
 *
 * @param wrapper - Смонтированный таб-бар.
 */
function buttons(wrapper: VueWrapper): HTMLButtonElement[] {
    return [
        ...wrapper.element.querySelectorAll('[data-reka-collection-item]'),
    ] as HTMLButtonElement[];
}

/**
 * Значения, отданные наверх через `update:modelValue`.
 *
 * @param wrapper - Смонтированный таб-бар.
 */
function emitted(wrapper: VueWrapper): string[] {
    return ((wrapper.emitted('update:modelValue') ?? []) as unknown[][]).map(
        (args) => args[0] as string
    );
}

// #endregion

describe('BricksTabBar: семантика группы', () => {
    it('группа объявлена как набор кнопок, а не как вкладки: панелей за ними нет', () => {
        const wrapper = mountTabBar();

        expect(wrapper.element.getAttribute('role')).toBe('group');
        expect(wrapper.element.getAttribute('aria-label')).toBe('Фильтр страниц');
        expect(wrapper.element.querySelector('[role="tab"]')).toBeNull();
    });

    it('корневой элемент — сама группа: класс потребителя достаётся ей, а не обёртке', () => {
        const wrapper = mountTabBar({ block: true });

        expect(wrapper.element.className).toContain('_BricksTabBar_');
        expect(wrapper.element.tagName).toBe('DIV');
    });

    it('нажатой числится ровно одна кнопка — та, что пришла в modelValue', () => {
        const wrapper = mountTabBar({ modelValue: 'drafts' });
        const pressed = buttons(wrapper).filter(
            (button) => button.getAttribute('aria-pressed') === 'true'
        );

        expect(pressed).toHaveLength(1);
        expect(pressed[0]!.textContent).toContain('Черновики');
    });
});

describe('BricksTabBar: выбор мышью', () => {
    it('нажатие на невыбранную кнопку отдаёт её значение наверх', async () => {
        const wrapper = mountTabBar();

        buttons(wrapper)[2]!.click();
        await nextTick();

        expect(emitted(wrapper)).toEqual(['drafts']);
    });

    it('повторное нажатие на выбранную ничего не отдаёт: группа не может остаться без выбора', async () => {
        const wrapper = mountTabBar();

        buttons(wrapper)[0]!.click();
        await nextTick();

        expect(emitted(wrapper)).toEqual([]);
    });

    it('выключенная кнопка не отдаёт значение', async () => {
        const wrapper = mountTabBar({
            items: [ITEMS[0]!, { ...ITEMS[1]!, disabled: true }, ITEMS[2]!],
        });
        const disabled = buttons(wrapper)[1]!;

        expect(disabled.disabled).toBe(true);

        disabled.click();
        await nextTick();

        expect(emitted(wrapper)).toEqual([]);
    });
});

describe('BricksTabBar: клавиатура', () => {
    /*
     * Переезд фокуса по стрелкам, Home/End и пропуск выключенных кнопок здесь не
     * проверяются: и happy-dom, и jsdom доводят событие до reka (та вызывает
     * `preventDefault`), но сам перенос фокуса — обход коллекции узлов с вызовом
     * `focus()` — в эмуляторах не срабатывает, и тест «падал» бы на исправном
     * коде. Живая проверка лежит в `e2e/specs/tab-bar-keyboard.spec.ts`.
     */

    it('группа отдаёт фокусу одну точку входа: снаружи табом, внутри стрелками', async () => {
        const wrapper = mountTabBar();

        // Группа становится доступной табу не сразу: кнопки регистрируются в
        // `onMounted`, и до этого их счётчик нулевой, а `tabindex` — «-1».
        await nextTick();

        expect(wrapper.element.getAttribute('tabindex')).toBe('0');
        expect(buttons(wrapper).map((button) => button.getAttribute('tabindex'))).toEqual([
            '-1',
            '-1',
            '-1',
        ]);
    });

    it('выключенная кнопка помечена для обхода стрелками', () => {
        const wrapper = mountTabBar({
            items: [ITEMS[0]!, { ...ITEMS[1]!, disabled: true }, ITEMS[2]!],
        });

        expect(buttons(wrapper)[1]!.dataset.disabled).toBe('');
        expect(buttons(wrapper)[0]!.dataset.disabled).toBeUndefined();
    });
});

describe('BricksTabBar: содержимое кнопки', () => {
    it('счётчик рисуется рядом с подписью', () => {
        const wrapper = mountTabBar();

        expect(wrapper.text()).toContain('Все');
        expect(wrapper.text()).toContain('· 7');
    });

    it('кнопка без подписи берёт доступное имя из label и рисует иконку', () => {
        const wrapper = mountTabBar({
            modelValue: 'desktop',
            iconOnly: true,
            items: [
                { value: 'desktop', label: 'Desktop', icon: 'ta:outline-device-desktop' },
                { value: 'mobile', label: 'Mobile', icon: 'ta:outline-device-mobile' },
            ],
        });
        const [desktop] = buttons(wrapper);

        expect(desktop!.getAttribute('aria-label')).toBe('Desktop');
        expect(desktop!.querySelector('[data-icon="ta:outline-device-desktop"]')).not.toBeNull();
        expect(desktop!.textContent?.trim()).toBe('');
    });

    it('подпись кнопки с тултипом остаётся доступной, а обёртка не влезает в группу', () => {
        const wrapper = mountTabBar({
            items: [{ value: 'all', label: 'Все', tooltip: 'Показать всё' }],
        });
        const wrapperEl = wrapper.element.firstElementChild!;

        expect(wrapperEl.getAttribute('role')).toBe('presentation');
        expect(buttons(wrapper)).toHaveLength(1);
        expect(buttons(wrapper)[0]!.textContent).toContain('Все');
    });
});

describe('BricksTabBar: слот действия у элемента', () => {
    /**
     * Монтирует бар с кнопкой действия у второго таба.
     *
     * @param overrides - Пропсы, переопределяющие дефолты.
     */
    function mountWithAction(overrides: Partial<IBricksTabBarProps> = {}): VueWrapper {
        return mount(BricksTabBar, {
            attachTo: document.body,
            props: {
                modelValue: 'published',
                items: [
                    ITEMS[0]!,
                    { ...ITEMS[1]!, hasAction: true },
                    ITEMS[2]!,
                ] as IBricksTabItem[],
                groupLabel: 'Фильтр страниц',
                variant: 'underline',
                ...overrides,
            },
            slots: {
                'item-action': (slotProps: { item: IBricksTabItem }) =>
                    slotProps.item.hasAction
                        ? h('button', { type: 'button', 'data-action': slotProps.item.value })
                        : null,
            },
            global: { components: { BricksIcon: BricksIconStub } },
        });
    }

    it('в слот приезжает тот элемент, рядом с которым он нарисован', () => {
        const wrapper = mountWithAction();
        const actions = [...wrapper.element.querySelectorAll('[data-action]')];

        expect(actions).toHaveLength(1);
        expect(actions[0]!.getAttribute('data-action')).toBe('published');
    });

    it('переключатель и действие стоят в одной обёртке', () => {
        const wrapper = mountWithAction();
        const action = wrapper.element.querySelector('[data-action]')!;
        const toggle = buttons(wrapper).find((button) =>
            button.textContent?.includes('Опубликованные')
        )!;

        expect(action.parentElement).toBe(toggle.parentElement);
    });

    it('действие не числится элементом группы: стрелки его не обходят', () => {
        const wrapper = mountWithAction();
        const action = wrapper.element.querySelector('[data-action]')!;

        expect(action.hasAttribute('data-reka-collection-item')).toBe(false);
        expect(buttons(wrapper)).toHaveLength(3);
    });

    it('действие остаётся обычной точкой табуляции', () => {
        const wrapper = mountWithAction();
        const action = wrapper.element.querySelector('[data-action]')!;

        expect(action.getAttribute('tabindex')).toBeNull();
    });

    it('нажатие на действие не меняет выбранный таб', async () => {
        const wrapper = mountWithAction();
        const action = wrapper.element.querySelector('[data-action]') as HTMLButtonElement;

        action.click();
        await nextTick();

        expect(emitted(wrapper)).toEqual([]);
    });

    it('подчёркивание рисует обёртка, а не сам переключатель', () => {
        const wrapper = mountWithAction();
        const toggle = buttons(wrapper).find((button) =>
            button.textContent?.includes('Опубликованные')
        )!;

        expect(toggle.parentElement!.className).toContain('_selected_');
        expect(toggle.className).not.toContain('_selected_');
    });

    it('обёртка с тултипом та же самая: действие остаётся соседом переключателя', () => {
        const wrapper = mountWithAction({
            items: [
                ITEMS[0]!,
                { ...ITEMS[1]!, hasAction: true, tooltip: 'Подсказка' },
                ITEMS[2]!,
            ] as IBricksTabItem[],
        });
        const action = wrapper.element.querySelector('[data-action]')!;
        const toggle = buttons(wrapper).find((button) =>
            button.textContent?.includes('Опубликованные')
        )!;

        expect(action.parentElement!.contains(toggle)).toBe(true);
    });

    it('в режиме block растягиваются обёртки, а не только переключатели', () => {
        const wrapper = mountWithAction({ block: true });
        const toggle = buttons(wrapper)[0]!;

        expect(toggle.parentElement!.className).toContain('_block_');
    });
});
