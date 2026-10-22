/**
 * @vitest-environment happy-dom
 *
 * The drop zone of a layout block asks the host before it promises a place, and shows
 * what came back when the answer is no.
 *
 * The defect the first half is written for: the rule of a permitted move (a cycle, an
 * ancestor into its own descendant, the depth of the schema, the capacity of a Grid or of
 * a slot) was applied by the store alone. The zone had a check of its own for a drop onto
 * itself and nothing else, so the canvas highlighted a gap, the person released the button
 * — and the store refused in silence.
 *
 * The defect the second half is written for: the refusal was answered by a flag the zone
 * raised and then dropped inside the same event, because a refusal ran the full reset of
 * the zone and the reset was what cleared the flag. Nothing was ever painted. The mark
 * therefore lives on the element and comes down on the terminal events only — and on the
 * next verdict, wherever it lands.
 *
 * The guard is injected, and its absence is deliberately permissive: a published page has
 * no host and moves nothing.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { defineComponent, h, nextTick, ref, type Ref } from 'vue';

// Test utils
import { mount } from '@vue/test-utils';

// Types
import type {
    IComponentDropGuard,
    TComponentDropTarget,
} from '../../src/runtime/modules/common/types/componentDrop';
import type { TComponentPlacementDecision } from '../../src/runtime/modules/common/types/componentPlacement';
import type { ILayoutDropZone } from '../../src/runtime/modules/layouts-blocks/types/dropZone';

// Constants
import {
    CANVAS_DRAG_ACTIVE_KEY,
    COMPONENT_DROP_GUARD_KEY,
} from '../../src/runtime/modules/common/constants/injectionKeys';

// Composables
import { useLayoutDropZone } from '../../src/runtime/modules/layouts-blocks/composables/useLayoutDropZone';
// #endregion

/** What the zone writes its refusal into, as the stylesheet of a block reads it. */
const REFUSAL_ATTRIBUTE = 'data-layout-drop-refusal';

/**
 * Minimal drag event: the payload type is what `applyDropEffect` reads.
 *
 * @param relatedTarget - Where the cursor is heading (the target of a leave).
 * @param types - dataTransfer types; anything outside the component ones is a foreign payload.
 * @returns The event and the dataTransfer the zone writes its answer into.
 */
function createDragEvent(
    relatedTarget: EventTarget | null = null,
    types: string[] = ['component-id']
): { event: DragEvent; dataTransfer: { dropEffect: string } } {
    const dataTransfer = {
        types,
        dropEffect: '',
        getData: () => 'moved-1',
    };

    const event = Object.assign(new Event('dragenter'), {
        relatedTarget,
        dataTransfer,
    }) as unknown as DragEvent;

    return { event, dataTransfer };
}

/**
 * Mounts a zone inside a component that provides the guard: `inject` needs a real
 * component context, and the drop event is dispatched from the container of the zone.
 *
 * @param guard - Guard of the host, or null to mount without one.
 * @param layoutId - Layout the zone belongs to; also the id of its container element.
 * @param isDragActive - Shared state of the native drag session.
 * @returns The zone API, the container and the drops the container received.
 */
function mountZone(
    guard: IComponentDropGuard | null,
    layoutId = 'layout-1',
    isDragActive: Ref<boolean> = ref(true)
): {
    zone: ILayoutDropZone;
    container: HTMLElement;
    drops: unknown[];
    unmount: () => void;
} {
    const container = document.createElement('div');
    container.id = layoutId;
    document.body.append(container);

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
                    layoutId: () => layoutId,
                    resolveDropIndex: () => 0,
                });

                return () => h('div');
            },
        }),
        {
            global: {
                provide: {
                    [CANVAS_DRAG_ACTIVE_KEY as symbol]: isDragActive,
                    ...(guard ? { [COMPONENT_DROP_GUARD_KEY as symbol]: guard } : {}),
                },
            },
        }
    );

    if (!zone) {
        throw new Error('The composable returned no API');
    }

    return { zone, container, drops, unmount: () => wrapper.unmount() };
}

/**
 * Guard that always answers the same verdict and records what it was asked about.
 *
 * @param decision - Verdict to answer with.
 * @returns The guard and the targets it received.
 */
function createGuard(decision: TComponentPlacementDecision): {
    guard: IComponentDropGuard;
    targets: TComponentDropTarget[];
} {
    const targets: TComponentDropTarget[] = [];

    return {
        targets,
        guard: {
            evaluateDrop(target) {
                targets.push(target);
                return decision;
            },
        },
    };
}

describe('useLayoutDropZone: the rule of a permitted move', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    it('a refused destination gets neither the highlight nor a dispatched drop', () => {
        const { guard, targets } = createGuard({ allowed: false, reason: 'grid-capacity' });
        const { zone, container, drops, unmount } = mountZone(guard);

        zone.handleDragEnter(createDragEvent().event);

        expect(targets).toEqual([{ kind: 'layout', parentId: 'layout-1' }]);
        expect(zone.isDragOver.value).toBe(false);
        expect(container.dataset.layoutDropActive).toBeUndefined();

        zone.handleDrop(createDragEvent().event);

        expect(drops).toEqual([]);

        unmount();
    });

    it('a permitted destination dispatches the drop once', () => {
        const { guard } = createGuard({ allowed: true });
        const { zone, drops, unmount } = mountZone(guard);

        zone.handleDragEnter(createDragEvent().event);
        expect(zone.isDragOver.value).toBe(true);

        zone.handleDrop(createDragEvent().event);

        expect(drops).toHaveLength(1);
        expect(drops[0]).toMatchObject({ layoutId: 'layout-1', movedComponentId: 'moved-1' });

        unmount();
    });

    it('the verdict is asked again on the drop and not carried over from the hover', () => {
        const verdicts: TComponentPlacementDecision[] = [
            { allowed: true },
            { allowed: false, reason: 'depth-limit' },
        ];
        const { zone, drops, unmount } = mountZone({
            evaluateDrop: () => verdicts.shift() ?? { allowed: true },
        });

        zone.handleDragOver(createDragEvent().event);
        expect(zone.isDragOver.value).toBe(true);

        zone.handleDrop(createDragEvent().event);

        expect(drops).toEqual([]);

        unmount();
    });

    it('without a host every destination is allowed: a published page moves nothing', () => {
        const { zone, drops, unmount } = mountZone(null);

        zone.handleDragEnter(createDragEvent().event);
        expect(zone.isDragOver.value).toBe(true);

        zone.handleDrop(createDragEvent().event);
        expect(drops).toHaveLength(1);

        unmount();
    });
});

describe('useLayoutDropZone: the mark a refusal leaves on the zone', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    it('outlives the event that produced it and carries the reason', () => {
        const { guard } = createGuard({ allowed: false, reason: 'grid-capacity' });
        const { zone, container, unmount } = mountZone(guard);

        zone.handleDragOver(createDragEvent().event);

        expect(container.getAttribute(REFUSAL_ATTRIBUTE)).toBe('grid-capacity');

        unmount();
    });

    it('comes down as soon as the same zone is allowed again', () => {
        const verdicts: TComponentPlacementDecision[] = [
            { allowed: false, reason: 'grid-capacity' },
            { allowed: true },
        ];
        const { zone, container, unmount } = mountZone({
            evaluateDrop: () => verdicts.shift() ?? { allowed: true },
        });

        zone.handleDragOver(createDragEvent().event);
        expect(container.getAttribute(REFUSAL_ATTRIBUTE)).toBe('grid-capacity');

        zone.handleDragOver(createDragEvent().event);
        expect(container.hasAttribute(REFUSAL_ATTRIBUTE)).toBe(false);

        unmount();
    });

    it('comes down on the exit of the cursor and on the end of the drag session', async () => {
        const { guard } = createGuard({ allowed: false, reason: 'grid-capacity' });
        const isDragActive = ref(true);
        const { zone, container, unmount } = mountZone(guard, 'layout-1', isDragActive);

        zone.handleDragOver(createDragEvent().event);
        zone.handleDragLeave(createDragEvent(null).event);

        expect(container.hasAttribute(REFUSAL_ATTRIBUTE)).toBe(false);

        zone.handleDragOver(createDragEvent().event);
        expect(container.getAttribute(REFUSAL_ATTRIBUTE)).toBe('grid-capacity');

        isDragActive.value = false;
        await nextTick();

        expect(container.hasAttribute(REFUSAL_ATTRIBUTE)).toBe(false);

        unmount();
    });

    it.each([['Files'], ['text/plain'], ['text/uri-list']])(
        'comes down for a %s payload, which the host is never asked about',
        (foreignType) => {
            const { guard, targets } = createGuard({ allowed: false, reason: 'grid-capacity' });
            const { zone, container, unmount } = mountZone(guard);

            zone.handleDragOver(createDragEvent().event);
            expect(container.getAttribute(REFUSAL_ATTRIBUTE)).toBe('grid-capacity');

            // Selected text and a link carry `text/plain` just as a canvas item does, and
            // the item carries `component-id` next to it — so the plain text alone belongs
            // to somebody else and must not enter the canvas as a component move
            const foreign = createDragEvent(null, [foreignType]);
            zone.handleDragOver(foreign.event);

            expect(container.hasAttribute(REFUSAL_ATTRIBUTE)).toBe(false);
            expect(foreign.dataTransfer.dropEffect).toBe('none');
            expect(targets).toHaveLength(1);

            unmount();
        }
    );

    it('belongs to one zone at a time, without waiting for a dragleave of the previous', () => {
        const { guard } = createGuard({ allowed: false, reason: 'grid-capacity' });
        const first = mountZone(guard, 'layout-1');
        const second = mountZone(guard, 'layout-2');

        first.zone.handleDragOver(createDragEvent().event);
        expect(first.container.getAttribute(REFUSAL_ATTRIBUTE)).toBe('grid-capacity');

        // The native order is the dragenter of the next zone before the dragleave of the
        // previous one, so the neighbor never gets a leave of its own here
        second.zone.handleDragEnter(createDragEvent().event);

        expect(first.container.hasAttribute(REFUSAL_ATTRIBUTE)).toBe(false);
        expect(second.container.getAttribute(REFUSAL_ATTRIBUTE)).toBe('grid-capacity');

        first.unmount();
        second.unmount();
    });
});
