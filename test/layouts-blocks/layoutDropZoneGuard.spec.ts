/**
 * @vitest-environment happy-dom
 *
 * The drop zone of a layout block asks the host before it promises a place.
 *
 * The defect the spec is written for: the rule of a permitted move (a cycle, an ancestor
 * into its own descendant, the depth of the schema, the capacity of a Grid or of a slot)
 * was applied by the store alone. The zone had a check of its own for a drop onto itself
 * and nothing else, so the canvas highlighted a gap, the person released the button — and
 * the store refused in silence.
 *
 * The guard is injected, and its absence is deliberately permissive: a published page has
 * no host and moves nothing.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { defineComponent, h, ref } from 'vue';

// Test utils
import { mount } from '@vue/test-utils';

// Types
import type {
    IComponentDropGuard,
    TComponentDropTarget,
} from '../../src/runtime/modules/common/types/componentDrop';
import type { ILayoutDropZone } from '../../src/runtime/modules/layouts-blocks/types/dropZone';

// Constants
import { COMPONENT_DROP_GUARD_KEY } from '../../src/runtime/modules/common/constants/injectionKeys';

// Composables
import { useLayoutDropZone } from '../../src/runtime/modules/layouts-blocks/composables/useLayoutDropZone';
// #endregion

/**
 * Minimal drag event: the payload type is what `applyDropEffect` reads.
 *
 * @param relatedTarget - Where the cursor is heading (the target of a leave).
 * @returns The event.
 */
function createDragEvent(relatedTarget: EventTarget | null = null): DragEvent {
    const event = new Event('dragenter') as DragEvent;

    return Object.assign(event, {
        relatedTarget,
        dataTransfer: {
            types: ['component-id'],
            dropEffect: '',
            getData: () => 'moved-1',
        },
    });
}

/**
 * Mounts the zone inside a component that provides the guard: `inject` needs a real
 * component context, and the drop event is dispatched from the container of the zone.
 *
 * @param guard - Guard of the host, or null to mount without one.
 * @returns The zone API, the container and the drops the container received.
 */
function mountZone(guard: IComponentDropGuard | null): {
    zone: ILayoutDropZone;
    container: HTMLElement;
    drops: unknown[];
    unmount: () => void;
} {
    document.body.innerHTML = '<div id="zone"></div>';
    const container = document.getElementById('zone') as HTMLElement;
    const drops: unknown[] = [];
    container.addEventListener('layout-drop', (event) => {
        drops.push((event as CustomEvent).detail);
    });

    let zone: ILayoutDropZone | null = null;

    const wrapper = mount(
        defineComponent({
            setup() {
                zone = useLayoutDropZone({
                    containerRef: ref(container),
                    layoutId: () => 'layout-1',
                    resolveDropIndex: () => 0,
                });

                return () => h('div');
            },
        }),
        guard ? { global: { provide: { [COMPONENT_DROP_GUARD_KEY as symbol]: guard } } } : {}
    );

    if (!zone) {
        throw new Error('The composable returned no API');
    }

    return { zone, container, drops, unmount: () => wrapper.unmount() };
}

describe('useLayoutDropZone: the rule of a permitted move', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    it('a refused destination gets neither the highlight nor a dispatched drop', () => {
        const canDrop = vi.fn(() => false);
        const { zone, container, drops, unmount } = mountZone({ canDrop });

        zone.handleDragEnter(createDragEvent());

        expect(canDrop).toHaveBeenCalledWith({ kind: 'layout', parentId: 'layout-1' });
        expect(zone.isDragOver.value).toBe(false);
        expect(container.dataset.layoutDropActive).toBeUndefined();

        zone.handleDrop(createDragEvent());

        expect(drops).toEqual([]);

        unmount();
    });

    it('a permitted destination dispatches the drop once', () => {
        const { zone, drops, unmount } = mountZone({ canDrop: () => true });

        zone.handleDragEnter(createDragEvent());
        expect(zone.isDragOver.value).toBe(true);

        zone.handleDrop(createDragEvent());

        expect(drops).toHaveLength(1);
        expect(drops[0]).toMatchObject({ layoutId: 'layout-1', movedComponentId: 'moved-1' });

        unmount();
    });

    it('the destination reaches the guard as the layout it belongs to', () => {
        const targets: TComponentDropTarget[] = [];
        const { zone, unmount } = mountZone({
            canDrop: (target) => {
                targets.push(target);
                return true;
            },
        });

        zone.handleDragOver(createDragEvent());

        expect(targets).toEqual([{ kind: 'layout', parentId: 'layout-1' }]);

        unmount();
    });

    it('without a host every destination is allowed: a published page moves nothing', () => {
        const { zone, drops, unmount } = mountZone(null);

        zone.handleDragEnter(createDragEvent());
        expect(zone.isDragOver.value).toBe(true);

        zone.handleDrop(createDragEvent());
        expect(drops).toHaveLength(1);

        unmount();
    });
});
