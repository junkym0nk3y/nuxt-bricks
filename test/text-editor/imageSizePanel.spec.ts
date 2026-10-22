/**
 * @vitest-environment happy-dom
 *
 * Панель размеров медиа: перевод размера между единицами.
 *
 * Дефект, ради которого спека написана: у `convertFromPx` не было ветки для
 * процентов, и переключение единицы на `%` писало число пикселей как проценты —
 * картинка шириной 300 px уезжала в DOM как `width: 300%`. Вторая половина того же
 * дефекта — процентная высота: в потоке текста она схлопывается в `auto`, поэтому
 * поле H в процентном режиме предлагало значение, которое заведомо выбрасывается.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { defineComponent, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
// #endregion

// #region Mocks
const { selectedMediaMock } = vi.hoisted(() => ({
    selectedMediaMock: { element: null as HTMLElement | null },
}));

vi.mock('../../src/runtime/modules/text-editor/utils/selectedMediaNode', () => ({
    findSelectedMediaNode: () =>
        selectedMediaMock.element
            ? { nodeName: 'image', element: selectedMediaMock.element }
            : null,
}));

vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));
// #endregion

import TextEditorImageSizePanel from '../../src/runtime/modules/text-editor/components/TextEditorImageSizePanel.vue';

/** Ширина блока, в котором лежит медиа: от неё считаются проценты. */
const CONTAINING_BLOCK_WIDTH = 600;

/** Заглушка редактора: панель трогает только эти методы. */
interface IEditorStub {
    attrs: Record<string, unknown>;
    updates: Record<string, unknown>[];
}

/**
 * Собирает DOM вокруг выбранной картинки: блок нужной ширины, внутри него контейнер
 * node view, внутри контейнера сама картинка. Проценты считаются от блока — в
 * контейнер как раз и пишется процентная ширина.
 *
 * @returns Элемент картинки.
 */
function buildMediaDom(): HTMLElement {
    document.body.innerHTML = `
        <p id="block">
            <span data-resize-container="true"><img id="media" /></span>
        </p>
    `;

    const block = document.getElementById('block') as HTMLElement;
    Object.defineProperty(block, 'clientWidth', {
        configurable: true,
        value: CONTAINING_BLOCK_WIDTH,
    });

    return document.getElementById('media') as HTMLElement;
}

/**
 * Собирает заглушку редактора с пиксельными размерами картинки.
 *
 * @param customAttrs - Единичные размеры узла, если они уже были заданы.
 * @returns Заглушка и её же журнал вызовов updateAttributes.
 */
function buildEditorStub(
    customAttrs: Record<string, unknown> = {}
): IEditorStub & Record<string, unknown> {
    const stub: IEditorStub & Record<string, unknown> = {
        attrs: {
            width: 300,
            height: 200,
            customWidth: null,
            customHeight: null,
            ...customAttrs,
        },
        updates: [],
    };

    const chain = {
        /**
         * Мета транзакции панель ставит своей командой — заглушке достаточно её принять.
         *
         * @returns Цепочка.
         */
        command: () => chain,
        /**
         * Запоминает записанные атрибуты и применяет их к состоянию узла.
         *
         * @param _type - Тип узла.
         * @param attrs - Записываемые атрибуты.
         * @returns Цепочка.
         */
        updateAttributes: (_type: string, attrs: Record<string, unknown>) => {
            stub.updates.push({ ...attrs });
            Object.assign(stub.attrs, attrs);
            return chain;
        },
        /**
         * Восстановление NodeSelection после setNodeMarkup.
         *
         * @returns Цепочка.
         */
        setNodeSelection: () => chain,
        /**
         * Прогон цепочки.
         *
         * @returns true.
         */
        run: () => true,
    };

    stub.getAttributes = () => stub.attrs;
    stub.chain = () => chain;
    stub.state = { selection: { from: 1 } };
    stub.view = { dom: document.body };

    return stub;
}

/** Тултип кита тянет reka-компоненты; для предмета спеки хватает пустой заглушки. */
const TooltipStub = defineComponent({
    name: 'BricksTooltip',
    setup: () => () => null,
});

/**
 * Монтирует панель над заглушкой редактора.
 *
 * Ждёт тик: размеры узла панель читает в `onMounted`, и до его конца разметка
 * показывает начальные значения полей, а не прочитанные из узла.
 *
 * @param customAttrs - Единичные размеры узла, если они уже были заданы.
 * @returns Обёртка теста и заглушка редактора.
 */
async function mountPanel(customAttrs: Record<string, unknown> = {}) {
    const editor = buildEditorStub(customAttrs);
    selectedMediaMock.element = buildMediaDom();

    const wrapper = mount(TextEditorImageSizePanel, {
        props: {
            editor: editor as unknown as never,
            activeNodeType: 'image',
        },
        global: {
            stubs: {
                BricksTooltip: TooltipStub,
                BricksTooltipHint: true,
                BricksIcon: true,
            },
        },
    });

    await nextTick();

    return { wrapper, editor };
}

/**
 * Нажимает кнопку единицы измерения.
 *
 * @param wrapper - Обёртка панели.
 */
async function clickUnitButton(
    wrapper: Awaited<ReturnType<typeof mountPanel>>['wrapper']
): Promise<void> {
    await wrapper.find('button').trigger('mousedown');
}

describe('TextEditorImageSizePanel: перебор единиц измерения', () => {
    beforeEach(() => {
        selectedMediaMock.element = null;
        document.body.innerHTML = '';
    });

    it('процент считается от ширины блока, а не пишется числом пикселей', async () => {
        const { wrapper, editor } = await mountPanel();

        // Стартовая единица — px (customWidth у узла нет), дальше по кругу до процентов
        expect(wrapper.find('button').text()).toBe('px');
        await clickUnitButton(wrapper);
        await clickUnitButton(wrapper);
        await clickUnitButton(wrapper);

        expect(wrapper.find('button').text()).toBe('%');
        expect(editor.updates.at(-1)).toEqual({ customWidth: '50%', customHeight: null });

        // Пиксельные attrs процентный режим не перезаписывает: из них node view берёт
        // отношение сторон, чтобы досчитать высоту
        expect(editor.attrs.width).toBe(300);
        expect(editor.attrs.height).toBe(200);
    });

    it('в процентах высота отдана отношению сторон: поле пусто и заблокировано', async () => {
        const { wrapper } = await mountPanel();

        await clickUnitButton(wrapper);
        await clickUnitButton(wrapper);
        await clickUnitButton(wrapper);

        const heightInput = wrapper.findAll('input')[1];
        expect((heightInput.element as HTMLInputElement).value).toBe('');
        expect(heightInput.attributes('disabled')).toBeDefined();
    });

    it('правка процентной ширины не рождает процентную высоту', async () => {
        const { wrapper, editor } = await mountPanel();

        await clickUnitButton(wrapper);
        await clickUnitButton(wrapper);
        await clickUnitButton(wrapper);

        const widthInput = wrapper.findAll('input')[0];
        await widthInput.setValue('80');
        await widthInput.trigger('blur');

        // Замок пропорций включён по умолчанию — до починки он дописывал высоту
        expect(editor.updates.at(-1)).toEqual({ customWidth: '80%', customHeight: null });
    });

    // Узел мог прийти с процентной высотой — из содержимого, написанного до того,
    // как панель перестала её предлагать. Правка ширины обязана её снять: в потоке
    // такая высота ничего не делает, а в published-страницу уезжает правилом-пустышкой
    it('процентная высота, доставшаяся от прежнего содержимого, снимается', async () => {
        const { wrapper, editor } = await mountPanel({
            customWidth: '50%',
            customHeight: '30%',
        });

        expect(wrapper.find('button').text()).toBe('%');

        const widthInput = wrapper.findAll('input')[0];
        await widthInput.setValue('150');
        await widthInput.trigger('blur');

        // Заодно потолок: больше 100% контейнера всё равно не покажет
        expect(editor.updates.at(-1)).toEqual({ customWidth: '100%', customHeight: null });
    });

    it('возврат из процентов в пиксели восстанавливает исходный размер', async () => {
        const { wrapper, editor } = await mountPanel();

        await clickUnitButton(wrapper);
        await clickUnitButton(wrapper);
        await clickUnitButton(wrapper);
        await clickUnitButton(wrapper);

        expect(wrapper.find('button').text()).toBe('px');
        expect(editor.updates.at(-1)).toEqual({
            customWidth: null,
            customHeight: null,
            width: 300,
            height: 200,
        });
    });
});
