/**
 * @vitest-environment happy-dom
 *
 * DOM-окружение включено только для этого файла: остальные тесты проекта живут в
 * node-окружении, и глобальный `window` им не нужен.
 */

// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Types
import type { IExtractedImageUrl } from '../../src/runtime/modules/builder/media/types/schemaImageResolver';

// Vue
import { defineComponent, h } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';

// Components
import BuilderMediaImageResolverItem from '../../src/runtime/modules/builder/media/components/BuilderMediaImageResolverItem.vue';
import TheBuilderMediaImageResolverModal from '../../src/runtime/modules/builder/media/components/TheBuilderMediaImageResolverModal.vue';
// #endregion

// #region Helpers
/**
 * Селект кита подменяется заглушкой: она отдаёт наверх ровно то, что ей велят,
 * включая значения, которых в списке опций нет. Настоящий селект такого не отдаст —
 * а проверяется здесь именно граница, где раньше стояло приведение типа.
 */
const BricksSelectStub = defineComponent({
    name: 'BricksSelect',
    props: {
        value: { type: null, default: null },
        specs: { type: Array, default: () => [] },
        facets: { type: Array, default: () => [] },
        disabled: { type: Boolean, default: false },
        ariaLabel: { type: String, default: '' },
    },
    emits: ['update:value'],
    setup: (props) => () =>
        h('div', { 'data-select': '', 'data-disabled': String(props.disabled) }),
});

const BricksIconStub = defineComponent({
    name: 'BricksIcon',
    props: { icon: { type: String, default: '' } },
    setup: () => () => h('i'),
});

const IMAGE: IExtractedImageUrl = {
    url: 'https://cdn.example.com/photo.png',
    locations: [
        {
            componentIndex: 0,
            componentId: 'component-1',
            componentName: 'Hero',
            propName: 'image',
            sourceType: 'simple-prop',
        },
    ],
};

const GLOBAL_MOUNT = {
    stubs: {
        BricksSelect: BricksSelectStub,
        BricksModal: { template: '<div><slot /></div>' },
        BricksModalHeader: { template: '<div><slot name="titleExtra" /></div>' },
        BricksModalFooter: { template: '<div><slot name="leading" /><slot /></div>' },
        BricksButton: { template: '<button><slot /></button>' },
    },
    components: { BricksIcon: BricksIconStub },
};

/**
 * Значения интерполяции подмешиваются в результат: без них подпись строки
 * сворачивается в один ключ, и проверка её уникальности перестаёт что-либо
 * различать — ровно тот дефект, который она сторожит.
 */
vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        t: (key: string, params?: Record<string, unknown>) =>
            params ? `${key}:${JSON.stringify(params)}` : key,
    }),
}));

/**
 * Отдаёт заглушку селекта смонтированного компонента.
 *
 * @param wrapper - Смонтированный компонент.
 */
function selectStub(wrapper: VueWrapper) {
    return wrapper.findComponent(BricksSelectStub);
}
// #endregion

describe('Резолвер изображений: значение из селекта проверяется, а не приводится', () => {
    it('строка резолвера отдаёт наверх известное действие вместе с URL картинки', async () => {
        const wrapper = mount(BuilderMediaImageResolverItem, {
            props: { image: IMAGE, action: 'keep' },
            global: GLOBAL_MOUNT,
        });

        await selectStub(wrapper).vm.$emit('update:value', 'placeholder');

        expect(wrapper.emitted('update:action')).toEqual([[IMAGE.url, 'placeholder']]);
    });

    it.each([
        ['null', null],
        ['булево', true],
        ['посторонняя строка', 'delete-everything'],
        ['объект', { action: 'placeholder' }],
    ])('строка резолвера молчит, когда селект отдаёт %s', async (_case, value) => {
        const wrapper = mount(BuilderMediaImageResolverItem, {
            props: { image: IMAGE, action: 'keep' },
            global: GLOBAL_MOUNT,
        });

        await selectStub(wrapper).vm.$emit('update:value', value);

        expect(wrapper.emitted('update:action')).toBeUndefined();
    });

    it('общий селект модалки отдаёт наверх известное действие', async () => {
        const wrapper = mount(TheBuilderMediaImageResolverModal, {
            props: {
                isOpen: true,
                state: { newImages: [], actions: new Map(), globalAction: 'keep' },
            },
            global: GLOBAL_MOUNT,
        });

        await selectStub(wrapper).vm.$emit('update:value', 'placeholder');

        expect(wrapper.emitted('setGlobalAction')).toEqual([['placeholder']]);
    });

    it('общий селект модалки молчит на посторонней строке', async () => {
        const wrapper = mount(TheBuilderMediaImageResolverModal, {
            props: {
                isOpen: true,
                state: { newImages: [], actions: new Map(), globalAction: 'keep' },
            },
            global: GLOBAL_MOUNT,
        });

        await selectStub(wrapper).vm.$emit('update:value', 'keeep');

        expect(wrapper.emitted('setGlobalAction')).toBeUndefined();
    });

    it('оба селекта показывают один и тот же набор опций', () => {
        const row = mount(BuilderMediaImageResolverItem, {
            props: { image: IMAGE, action: 'keep' },
            global: GLOBAL_MOUNT,
        });
        const modal = mount(TheBuilderMediaImageResolverModal, {
            props: {
                isOpen: true,
                state: { newImages: [], actions: new Map(), globalAction: 'keep' },
            },
            global: GLOBAL_MOUNT,
        });

        const rowSpecs = selectStub(row).props('specs');
        const modalSpecs = selectStub(modal).props('specs');

        expect(rowSpecs).toEqual(modalSpecs);
        expect(rowSpecs).toEqual([
            { label: 'bricks.media.resolver.keep', value: 'keep' },
            { label: 'bricks.media.resolver.placeholder', value: 'placeholder' },
        ]);
        expect(selectStub(row).props('facets')).toEqual(['keep', 'placeholder']);
    });

    it('имя селекта различает адреса, совпадающие началом и концом', () => {
        // Сокращение адреса держит края и выбрасывает середину, поэтому два
        // разных файла под одним префиксом и одним хвостом сворачиваются в
        // одну и ту же видимую строку
        const head = 'https://cdn.example.com/media/';
        const tail = '/deep/original-image-file.png';
        const first = mount(BuilderMediaImageResolverItem, {
            props: { image: { url: `${head}alpha${tail}`, locations: [] }, action: 'keep' },
            global: GLOBAL_MOUNT,
        });
        const other = mount(BuilderMediaImageResolverItem, {
            props: { image: { url: `${head}bravo${tail}`, locations: [] }, action: 'keep' },
            global: GLOBAL_MOUNT,
        });

        expect(first.get('[title]').text()).toBe(other.get('[title]').text());
        expect(selectStub(first).props('ariaLabel')).not.toBe(selectStub(other).props('ariaLabel'));
    });

    it('соседние строки называют свои селекты по-разному, даже когда блок один и тот же', () => {
        const second: IExtractedImageUrl = {
            url: 'https://cdn.example.com/other.png',
            locations: [{ ...IMAGE.locations[0]! }],
        };

        const first = mount(BuilderMediaImageResolverItem, {
            props: { image: IMAGE, action: 'keep' },
            global: GLOBAL_MOUNT,
        });
        const other = mount(BuilderMediaImageResolverItem, {
            props: { image: second, action: 'keep' },
            global: GLOBAL_MOUNT,
        });

        expect(selectStub(first).props('ariaLabel')).not.toBe(selectStub(other).props('ariaLabel'));
    });

    it('блокировка строки доезжает до селекта: во время применения выбор менять нельзя', () => {
        const wrapper = mount(BuilderMediaImageResolverItem, {
            props: { image: IMAGE, action: 'keep', disabled: true },
            global: GLOBAL_MOUNT,
        });

        expect(selectStub(wrapper).props('disabled')).toBe(true);
    });

    it('кнопки подвала модалки отдают наверх свой исход', async () => {
        const wrapper = mount(TheBuilderMediaImageResolverModal, {
            props: {
                isOpen: true,
                state: { newImages: [], actions: new Map(), globalAction: 'keep' },
            },
            global: GLOBAL_MOUNT,
        });
        const buttons = wrapper.findAll('button');

        for (const button of buttons) {
            await button.trigger('click');
        }

        expect(wrapper.emitted('skip')).toHaveLength(1);
        expect(wrapper.emitted('cancel')).toHaveLength(1);
        expect(wrapper.emitted('confirm')).toHaveLength(1);
    });

    it('выбор в строке доезжает до модалки вместе с URL картинки', async () => {
        const wrapper = mount(TheBuilderMediaImageResolverModal, {
            props: {
                isOpen: true,
                state: { newImages: [IMAGE], actions: new Map(), globalAction: 'keep' },
            },
            global: GLOBAL_MOUNT,
        });
        const row = wrapper.findComponent(BuilderMediaImageResolverItem);

        await row.vm.$emit('update:action', IMAGE.url, 'placeholder');

        expect(wrapper.emitted('setImageAction')).toEqual([[IMAGE.url, 'placeholder']]);
    });

    it('длинный адрес показывается срезанным, а полный остаётся в подсказке', () => {
        const long: IExtractedImageUrl = {
            url: `https://cdn.example.com/${'a'.repeat(80)}.png`,
            locations: [],
        };

        const wrapper = mount(BuilderMediaImageResolverItem, {
            props: { image: long, action: 'keep' },
            global: GLOBAL_MOUNT,
        });
        const shown = wrapper.get('[title]');

        expect(shown.attributes('title')).toBe(long.url);
        expect(shown.text()).toContain('...');
        expect(shown.text().length).toBeLessThan(long.url.length);
    });

    it('строка без места в схеме обходится без имени компонента', () => {
        const wrapper = mount(BuilderMediaImageResolverItem, {
            props: { image: { url: IMAGE.url, locations: [] }, action: 'keep' },
            global: GLOBAL_MOUNT,
        });

        expect(wrapper.text()).not.toContain('Hero');
    });

    it('недоступное превью уступает место заглушке, а строка остаётся рабочей', async () => {
        const wrapper = mount(BuilderMediaImageResolverItem, {
            props: { image: IMAGE, action: 'keep' },
            global: GLOBAL_MOUNT,
        });

        await wrapper.get('img').trigger('error');

        expect(wrapper.find('img').exists()).toBe(false);
        expect(selectStub(wrapper).exists()).toBe(true);
    });
});
