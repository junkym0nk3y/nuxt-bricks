/**
 * @vitest-environment happy-dom
 *
 * The axis each drop zone feeds the shared walk, and the selector it picks its children
 * with.
 *
 * Flex, Section, the slider and the root of the canvas now share one walk, and the unit
 * spec of that walk proves nothing but its own arithmetic. What each zone hands it is
 * invisible from there: a swapped axis in a single adapter leaves that spec green. So
 * every zone is checked through its own public surface, on coordinates where the two
 * axes deliberately disagree.
 */

// #region Imports
// Types
import type { IFlexLayoutProps } from '../../src/runtime/modules/layouts-blocks/types/blockProps';
import type { TBricksComponentsStore } from '../../src/runtime/modules/builder/core/stores/components';

// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { ref, type Component } from 'vue';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Vue test utils
import { mount } from '@vue/test-utils';

// Composables
import { useSliderDropTarget } from '../../src/runtime/modules/layouts-blocks/composables/useSliderDropTarget';
import { useCanvasDrops } from '../../src/runtime/modules/builder/canvas/viewport/composables/useCanvasDrops';

// Components
import BlockFlex from '../../src/runtime/modules/layouts-blocks/components/BlockFlex.vue';
import BlockSection from '../../src/runtime/modules/layouts-blocks/components/BlockSection.vue';
// #endregion

// The refusal toast of the canvas travels through i18n, which a unit spec has no
// business bootstrapping: the subject here is the axis, not the message
vi.mock('../../src/runtime/modules/builder/core/composables/useComponentMoveFeedback', () => ({
    useComponentMoveFeedback: () => ({ reportRefusedMove: () => undefined }),
}));

/**
 * Two children of a zone: midpoints at 50 and 250 horizontally, at 150 and 350
 * vertically. The axes disagree on purpose — with matching midpoints a swapped axis
 * would answer the same index.
 */
const CHILD_RECTS = [
    { left: 0, top: 100, width: 100, height: 100 },
    { left: 200, top: 300, width: 100, height: 100 },
];

const FLEX_LAYOUT_PROPS: IFlexLayoutProps = {
    direction: 'row',
    justify: 'start',
    align: 'stretch',
    gap: 12,
    wrap: false,
};

const TWO_CHILDREN = {
    default: '<div data-layout-drop-item="true"></div><div data-layout-drop-item="true"></div>',
};

/**
 * Gives the elements fixed rectangles: happy-dom lays nothing out.
 *
 * @param children - Elements to stub, in order.
 */
function stubRects(children: HTMLElement[]): void {
    children.forEach((child, index) => {
        const rect = CHILD_RECTS[index];

        child.getBoundingClientRect = () =>
            ({
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
                right: rect.left + rect.width,
                bottom: rect.top + rect.height,
            }) as DOMRect;
    });
}

/**
 * Builds a drag event with a payload the zones accept.
 *
 * @param type - Event type.
 * @param clientX - Horizontal coordinate of the cursor.
 * @param clientY - Vertical coordinate of the cursor.
 * @returns The event.
 */
function createDragEvent(type: string, clientX: number, clientY: number): DragEvent {
    return Object.assign(new Event(type, { bubbles: true }), {
        clientX,
        clientY,
        dataTransfer: {
            types: ['component-id'],
            dropEffect: '',
            getData: () => 'component-1',
        },
    }) as unknown as DragEvent;
}

/**
 * Drops onto a layout zone and reports the targetIndex it announced to the canvas.
 *
 * @param root - Root element of the block.
 * @param clientX - Horizontal coordinate of the cursor.
 * @param clientY - Vertical coordinate of the cursor.
 * @returns The insertion index carried by the `layout-drop` event.
 */
function dropAt(root: HTMLElement, clientX: number, clientY: number): number | null {
    let targetIndex: number | null = null;
    root.addEventListener('layout-drop', (event) => {
        targetIndex = (event as CustomEvent).detail.targetIndex;
    });

    root.dispatchEvent(createDragEvent('drop', clientX, clientY));

    return targetIndex;
}

/**
 * Mounts a layout block with two children of known geometry.
 *
 * @param block - Block component.
 * @param layoutProps - Layout props of the block.
 * @returns Root element of the mounted block.
 */
function mountBlockWithChildren(block: Component, layoutProps: object): HTMLElement {
    const wrapper = mount(block, {
        props: { layoutId: 'layout-1', layoutProps },
        slots: TWO_CHILDREN,
    });
    const root = wrapper.element as HTMLElement;
    stubRects(Array.from(root.querySelectorAll<HTMLElement>('[data-layout-drop-item]')));

    return root;
}

describe('the axis a flow block walks its children along', () => {
    it('measures horizontally when a Flex has direction row', () => {
        const root = mountBlockWithChildren(BlockFlex, FLEX_LAYOUT_PROPS);

        // Before the horizontal midpoint of the first child (50) and below both vertical
        // ones (150, 350): the vertical axis would answer 2
        expect(dropAt(root, 10, 999)).toBe(0);
    });

    it('measures vertically when a Flex has direction column', () => {
        const root = mountBlockWithChildren(BlockFlex, {
            ...FLEX_LAYOUT_PROPS,
            direction: 'column',
        });

        // The mirror case: before the vertical midpoint of the first child (150) and to
        // the right of both horizontal ones (50, 250)
        expect(dropAt(root, 999, 10)).toBe(0);
    });

    it('measures a Section vertically whatever the horizontal coordinate', () => {
        const root = mountBlockWithChildren(BlockSection, { paddingX: 2 });

        expect(dropAt(root, 999, 10)).toBe(0);
        expect(dropAt(root, 0, 999)).toBe(2);
    });
});

describe('the axis the slider walks its slides along', () => {
    /**
     * Builds the Swiper markup of a slider, loop duplicate and placeholder included.
     *
     * @returns Root element of the slider.
     */
    function buildSlider(): HTMLElement {
        document.body.innerHTML = `
            <div id="slider">
                <div class="swiper-wrapper">
                    <div class="swiper-slide" id="first"></div>
                    <div class="swiper-slide" id="second"></div>
                    <div class="swiper-slide swiper-slide-duplicate" id="loop-copy"></div>
                    <div class="swiper-slide" data-layout-drop-destination="true" id="ph"></div>
                </div>
            </div>
        `;
        const root = document.getElementById('slider') as HTMLElement;
        stubRects([
            document.getElementById('first') as HTMLElement,
            document.getElementById('second') as HTMLElement,
        ]);

        return root;
    }

    it('leaves the loop duplicates and the placeholder out of the selection', () => {
        const root = buildSlider();
        const { getDraggableSlides } = useSliderDropTarget(ref(root));

        expect(getDraggableSlides().map((node) => node.id)).toEqual(['first', 'second']);
    });

    it('measures horizontally: the vertical coordinate does not move the slide index', () => {
        const root = buildSlider();
        const { resolveSliderDropIndex } = useSliderDropTarget(ref(root));

        // Before the horizontal midpoint of the first slide (50) and below both vertical
        // ones: the vertical axis would answer 2
        expect(resolveSliderDropIndex(createDragEvent('dragover', 10, 999))).toBe(0);
        expect(resolveSliderDropIndex(createDragEvent('dragover', 999, 10))).toBe(2);
    });
});

describe('the axis the canvas root walks its blocks along', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        // inject outside setup() — a Vue warning unrelated to the subject
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    it('measures vertically: the horizontal coordinate does not move the root index', () => {
        document.body.innerHTML = `
            <div id="root">
                <div data-layout-drop-item="true" id="a"></div>
                <div data-layout-drop-item="true" id="b"></div>
            </div>
        `;
        const container = document.getElementById('root') as HTMLElement;
        stubRects(Array.from(container.querySelectorAll<HTMLElement>('[data-layout-drop-item]')));

        const { rootDropIndex, handleRootDragOver } = useCanvasDrops({
            componentsStore: {
                getComponentById: () => undefined,
            } as unknown as TBricksComponentsStore,
            canvasRef: ref(container),
            containerRef: ref(container),
        });

        const above = createDragEvent('dragover', 999, 10);
        Object.defineProperty(above, 'target', { value: container });
        handleRootDragOver(above);
        expect(rootDropIndex.value).toBe(0);

        const below = createDragEvent('dragover', 0, 999);
        Object.defineProperty(below, 'target', { value: container });
        handleRootDragOver(below);
        expect(rootDropIndex.value).toBe(2);
    });
});
