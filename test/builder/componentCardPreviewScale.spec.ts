/**
 * @vitest-environment happy-dom
 *
 * The preview of a library card is scaled to contain: the component fits into the
 * thumbnail whole. The size of that thumbnail lives in the CSS, and the composable used
 * to keep a copy of it as a constant — a copy that drifts away silently, leaving the
 * preview simply not fitting.
 *
 * What is checked here: the area is measured through the DOM, a measurement of zero
 * keeps the last scale that was real instead of repainting the card, and the arrival of
 * the brick module recomputes the scale — a preview that loads slower than the first
 * measurement used to keep the scale of an empty card forever.
 */

// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { defineComponent, h, nextTick, type Component } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';

// Types
import type { IComponentCardPreview } from '../../src/runtime/modules/builder/shell/sidebar/components/types';
import type { IComponentLibraryItem } from '../../src/runtime/modules/common/types/brick';
// #endregion

// #region Mocks
const { importState } = vi.hoisted(() => ({
    importState: {
        loader: null as null | (() => Promise<{ default: Component }>),
    },
}));

vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('../../src/runtime/modules/common/composables/useBrickImports', () => ({
    useBrickImports: () => ({
        findImportModule: () => importState.loader,
    }),
}));

vi.mock('../../src/runtime/modules/layouts-blocks/registry', () => ({
    getBlockDefinition: () => undefined,
    resolveBlockProps: () => ({}),
    resolveCanvasBind: () => ({}),
}));

vi.mock('../../src/runtime/modules/layouts-blocks/canvasBlockComponents', () => ({
    CANVAS_BLOCK_COMPONENTS: {},
}));
// #endregion

import { useComponentCardPreview } from '../../src/runtime/modules/builder/shell/sidebar/composables/useComponentCardPreview';

/** Card of a user brick: a layout card has no live preview at all. */
const CARD: IComponentLibraryItem = {
    name: 'TestBrick',
    category: 'bricks',
    brickPath: 'bricks/TestBrick.brick.ts',
    defaultProps: { title: 'Hello' },
};

let api: IComponentCardPreview | null = null;

/**
 * Pins the geometry of an element: happy-dom computes no layout, and the composable
 * reads exactly these properties.
 *
 * @param element - Element to pin.
 * @param box - Values of the geometry properties.
 */
function setBox(element: Element, box: Record<string, number>): void {
    for (const [property, value] of Object.entries(box)) {
        Object.defineProperty(element, property, { configurable: true, get: () => value });
    }
}

/**
 * Props of a host, declared the way the card itself declares them: the composable
 * watches them, so a plain object captured once would make every watcher of this spec
 * silent.
 */
const HOST_PROPS = {
    component: { type: Object as () => IComponentLibraryItem, required: true as const },
    isLayout: { type: Boolean, default: false },
};

/** Host of the preview with a content element of its own (no async component). */
const PlainHost = defineComponent({
    props: HOST_PROPS,
    setup(props) {
        api = useComponentCardPreview(props);

        return () =>
            h('div', { ref: api?.previewWrapperRef, class: 'wrapper' }, [
                h('div', { ref: api?.componentWrapperRef, class: 'inner' }, [
                    h('div', { class: 'content' }),
                ]),
            ]);
    },
});

/** Host that renders the lazily loaded brick, the way the card does. */
const AsyncHost = defineComponent({
    props: HOST_PROPS,
    setup(props) {
        api = useComponentCardPreview(props);

        return () =>
            h('div', { ref: api?.previewWrapperRef, class: 'wrapper' }, [
                h(
                    'div',
                    { ref: api?.componentWrapperRef, class: 'inner' },
                    api?.ComponentPreview.value ? [h(api.ComponentPreview.value)] : []
                ),
            ]);
    },
});

/**
 * Lets the composable reach its measurement: it waits for the DOM and then debounces.
 */
async function flushMeasurement(): Promise<void> {
    await nextTick();
    await nextTick();
    vi.advanceTimersByTime(100);
    await nextTick();
}

describe('component card preview: the scale comes from the DOM', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        api = null;
        importState.loader = null;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('takes the height of the preview area from the wrapper, not from a constant', async () => {
        const wrapper = mount(PlainHost, { props: { component: CARD } });

        setBox(wrapper.find('.wrapper').element, { clientWidth: 300, clientHeight: 120 });
        setBox(wrapper.find('.inner').element, { offsetWidth: 1600, scrollWidth: 1600 });
        setBox(wrapper.find('.content').element, { offsetWidth: 200, offsetHeight: 200 });

        await flushMeasurement();

        // Contain over both axes: 120 / 200 is the tighter of the two
        expect(api?.previewScale.value).toBeCloseTo(0.6, 5);
    });

    it('keeps the last real scale when the area measures zero', async () => {
        const wrapper = mount(PlainHost, { props: { component: CARD } });

        setBox(wrapper.find('.wrapper').element, { clientWidth: 300, clientHeight: 120 });
        setBox(wrapper.find('.inner').element, { offsetWidth: 1600, scrollWidth: 1600 });
        setBox(wrapper.find('.content').element, { offsetWidth: 200, offsetHeight: 200 });
        await flushMeasurement();

        // The card is hidden: the wrapper is still in the DOM and has no size
        setBox(wrapper.find('.wrapper').element, { clientWidth: 0, clientHeight: 0 });
        await wrapper.setProps({ component: { ...CARD, defaultProps: { title: 'Edited' } } });
        await flushMeasurement();

        expect(api?.previewScale.value).toBeCloseTo(0.6, 5);
    });

    it('measures again when the props the component renders with change', async () => {
        const wrapper = mount(PlainHost, { props: { component: CARD } });

        setBox(wrapper.find('.wrapper').element, { clientWidth: 300, clientHeight: 120 });
        setBox(wrapper.find('.inner').element, { offsetWidth: 1600, scrollWidth: 1600 });
        setBox(wrapper.find('.content').element, { offsetWidth: 200, offsetHeight: 200 });
        await flushMeasurement();

        // Other props render a smaller component: it is scaled up to fill the area
        setBox(wrapper.find('.content').element, { offsetWidth: 100, offsetHeight: 100 });
        await wrapper.setProps({ component: { ...CARD, defaultProps: { title: 'Short' } } });
        await flushMeasurement();

        expect(api?.previewScale.value).toBeCloseTo(1.2, 5);
    });

    it('recomputes the scale once the brick module has arrived', async () => {
        let resolveModule: (value: { default: Component }) => void = () => undefined;
        importState.loader = () =>
            new Promise<{ default: Component }>((resolve) => {
                resolveModule = resolve;
            });

        const wrapper = mount(AsyncHost, { props: { component: CARD } });

        setBox(wrapper.find('.wrapper').element, { clientWidth: 300, clientHeight: 120 });
        setBox(wrapper.find('.inner').element, { offsetWidth: 1600, scrollWidth: 1600 });

        // The first measurement happens while the module is still on its way
        await flushMeasurement();
        expect(api?.previewScale.value).toBe(1);

        resolveModule({
            default: defineComponent({
                setup() {
                    return () => h('div', { class: 'brick' });
                },
            }),
        });
        await flushPromises();
        await nextTick();
        setBox(wrapper.find('.brick').element, { offsetWidth: 200, offsetHeight: 200 });

        await flushMeasurement();

        expect(api?.previewScale.value).toBeCloseTo(0.6, 5);
    });
});
