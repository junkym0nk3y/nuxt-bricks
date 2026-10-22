/**
 * @vitest-environment happy-dom
 *
 * The whole seam of a refusal, end to end: the real provider of the canvas, the real rule
 * of a permitted move over a real schema, and the mark the drop zone leaves on the DOM.
 *
 * Every piece of this has a spec of its own — the rule has its matrix, the zone has a fake
 * guard — and that is precisely the gap: a mutation losing the reason on the way from the
 * rule to the zone breaks nothing either spec asserts, while the red state of a full Grid
 * disappears. The cases below hold the two ends together and look only at what the person
 * sees: whether the element carries the reason.
 *
 * The viewport is a parameter of the provider and not a read of the store, because a
 * Figma-mode board draws every device at once; a Grid full on mobile takes a child on
 * desktop, and the case below is the one that would catch a provider reading the active
 * viewport instead of the one it was given.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { defineComponent, h, ref } from 'vue';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Test utils
import { mount } from '@vue/test-utils';

// Types
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';
import type { ILayoutDropZone } from '../../src/runtime/modules/layouts-blocks/types/dropZone';

// Constants
import { CANVAS_DRAG_ACTIVE_KEY } from '../../src/runtime/modules/common/constants/injectionKeys';

// Stores
import { useCanvasStore } from '../../src/runtime/modules/builder/core/stores/canvas';
import { useComponentsStore } from '../../src/runtime/modules/builder/core/stores/components';

// Composables
import { useCanvasDropGuard } from '../../src/runtime/modules/builder/canvas/viewport/composables/useCanvasDropGuard';
import { useLayoutDropZone } from '../../src/runtime/modules/layouts-blocks/composables/useLayoutDropZone';
// #endregion

/** What the zone writes its refusal into, as the stylesheet of a block reads it. */
const REFUSAL_ATTRIBUTE = 'data-layout-drop-refusal';

const GRID_ID = 'grid-1';

/**
 * A Grid of two cells on mobile and eight on desktop, filled with four children.
 *
 * The responsive override is what makes one and the same schema full on one sheet and
 * open on another.
 *
 * @returns The Grid and its children.
 */
function buildFullMobileGrid(): IBricksComponent[] {
    const children = ['child-0', 'child-1', 'child-2', 'child-3'];

    const grid: IBricksComponent = {
        id: GRID_ID,
        type: 'layout',
        componentName: 'Grid',
        brickPath: 'layout/grid',
        zIndex: 1,
        props: {
            rows: 2,
            columns: 4,
            responsive: { mobile: { rows: 1, columns: 2 } },
        },
        children,
    };

    return [
        grid,
        ...children.map<IBricksComponent>((id) => ({
            id,
            type: 'layout',
            componentName: 'Text',
            brickPath: 'layout/text',
            zIndex: 1,
            props: {},
            parent: GRID_ID,
        })),
    ];
}

/**
 * Mounts the real guard of a viewport over a zone bound to the Grid.
 *
 * @param viewport - Viewport of the sheet the provider covers.
 * @returns The zone API, its container element and the unmount.
 */
function mountGuardedZone(viewport: string): {
    zone: ILayoutDropZone;
    container: HTMLElement;
    unmount: () => void;
} {
    const container = document.createElement('div');
    document.body.append(container);

    let zone: ILayoutDropZone | null = null;

    const wrapper = mount(
        defineComponent({
            setup() {
                useCanvasDropGuard(() => viewport as 'mobile' | 'desktop');

                return () =>
                    h(
                        defineComponent({
                            setup() {
                                zone = useLayoutDropZone({
                                    containerRef: ref(container),
                                    layoutId: () => GRID_ID,
                                    resolveDropIndex: () => 0,
                                });

                                return () => h('div');
                            },
                        })
                    );
            },
        }),
        { global: { provide: { [CANVAS_DRAG_ACTIVE_KEY as symbol]: ref(true) } } }
    );

    const api = zone as ILayoutDropZone | null;

    if (!api) {
        throw new Error('The composable returned no API');
    }

    return { zone: api, container, unmount: () => wrapper.unmount() };
}

/**
 * Minimal drag event carrying a component payload.
 *
 * @param relatedTarget - Where the cursor is heading (the target of a leave).
 * @returns The event.
 */
function createDragEvent(relatedTarget: EventTarget | null = null): DragEvent {
    return Object.assign(new Event('dragover'), {
        relatedTarget,
        dataTransfer: {
            types: ['component-id'],
            dropEffect: '',
            getData: () => '',
        },
    }) as unknown as DragEvent;
}

describe('the refusal of a full Grid, from the rule to the element', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        setActivePinia(createPinia());
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        useComponentsStore().components = buildFullMobileGrid();
    });

    it('marks the Grid out of cells for a block dragged in from the library', () => {
        useCanvasStore().dragState.source = 'library';
        const { zone, container, unmount } = mountGuardedZone('mobile');

        zone.handleDragOver(createDragEvent());

        expect(container.getAttribute(REFUSAL_ATTRIBUTE)).toBe('grid-capacity');
        expect(zone.isDragOver.value).toBe(false);

        unmount();
    });

    it('marks the Grid for a component that lives somewhere else', () => {
        const componentsStore = useComponentsStore();
        componentsStore.components = [
            ...componentsStore.components,
            {
                id: 'stranger',
                type: 'layout',
                componentName: 'Text',
                brickPath: 'layout/text',
                zIndex: 1,
                props: {},
            },
        ];
        const canvasStore = useCanvasStore();
        canvasStore.dragState.source = 'canvas';
        canvasStore.dragState.componentId = 'stranger';

        const { zone, container, unmount } = mountGuardedZone('mobile');

        zone.handleDragOver(createDragEvent());

        expect(container.getAttribute(REFUSAL_ATTRIBUTE)).toBe('grid-capacity');

        unmount();
    });

    it('leaves its own child unmarked: a rearrangement takes no new cell', () => {
        const canvasStore = useCanvasStore();
        canvasStore.dragState.source = 'canvas';
        canvasStore.dragState.componentId = 'child-1';

        const { zone, container, unmount } = mountGuardedZone('mobile');

        zone.handleDragOver(createDragEvent());

        expect(container.hasAttribute(REFUSAL_ATTRIBUTE)).toBe(false);
        expect(zone.isDragOver.value).toBe(true);

        unmount();
    });

    it('counts the cells of the sheet it draws, not of the active viewport', () => {
        useCanvasStore().dragState.source = 'library';
        const { zone, container, unmount } = mountGuardedZone('desktop');

        zone.handleDragOver(createDragEvent());

        // The same four children in a Grid of eight cells: the desktop sheet has room
        expect(container.hasAttribute(REFUSAL_ATTRIBUTE)).toBe(false);

        unmount();
    });

    it('takes the mark down when the cursor leaves', () => {
        useCanvasStore().dragState.source = 'library';
        const { zone, container, unmount } = mountGuardedZone('mobile');

        zone.handleDragOver(createDragEvent());
        expect(container.getAttribute(REFUSAL_ATTRIBUTE)).toBe('grid-capacity');

        zone.handleDragLeave(createDragEvent(null));

        expect(container.hasAttribute(REFUSAL_ATTRIBUTE)).toBe(false);

        unmount();
    });
});
