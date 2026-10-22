/**
 * @vitest-environment happy-dom
 *
 * A slot asks the host the same question a layout drop zone asks, and has to read the
 * answer the same way.
 *
 * The trap this is written for: the host answers with a verdict object, and every object
 * is truthy — a slot testing it as a boolean would accept a move the store then refuses,
 * which is exactly the silence the guard was introduced to end. Only behavior can tell
 * the two readings apart, so the cases below drive the handlers rather than the types.
 *
 * A slot draws no state of its own for a refusal: what it shows is the absence of an
 * insertion point, and what it withholds is the drop event.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it } from 'vitest';

// Vue
import { defineComponent, h } from 'vue';

// Test utils
import { mount } from '@vue/test-utils';

// Types
import type {
    IComponentDropGuard,
    TComponentDropTarget,
} from '../../src/runtime/modules/common/types/componentDrop';
import type { TComponentPlacementDecision } from '../../src/runtime/modules/common/types/componentPlacement';
import type { IUseSlotDragDropReturn } from '../../src/runtime/modules/builder/canvas/types/composables';

// Constants
import { COMPONENT_DROP_GUARD_KEY } from '../../src/runtime/modules/common/constants/injectionKeys';

// Composables
import { useSlotDragDrop } from '../../src/runtime/modules/builder/canvas/item/composables/useSlotDragDrop';
// #endregion

const SLOT_NAME = 'content';
const PARENT_ID = 'parent-1';

/**
 * Minimal drag event: the payload type is what `applyDropEffect` reads.
 *
 * @returns The event.
 */
function createDragEvent(): DragEvent {
    return Object.assign(new Event('dragenter'), {
        clientY: 0,
        relatedTarget: null,
        dataTransfer: {
            types: ['component-id'],
            dropEffect: '',
            getData: () => 'moved-1',
        },
    }) as unknown as DragEvent;
}

/**
 * Mounts the slot composable under a provided guard and binds a container to the slot.
 *
 * @param decision - Verdict the host answers with.
 * @returns The composable API, the container, the drops it saw and what the guard was asked.
 */
function mountSlot(decision: TComponentPlacementDecision): {
    slot: IUseSlotDragDropReturn;
    container: HTMLElement;
    drops: unknown[];
    targets: TComponentDropTarget[];
    unmount: () => void;
} {
    // The slot sits inside a layout zone, the way a brick component sits in a Grid cell:
    // that outer element is what carries a refusal mark, and no dragleave reaches it for a
    // cursor that moved into the slot without leaving its container
    document.body.innerHTML = '<div id="layout"><div id="slot"></div></div>';
    const container = document.getElementById('slot') as HTMLElement;

    const drops: unknown[] = [];
    container.addEventListener('slot-drop', (event) => {
        drops.push((event as CustomEvent).detail);
    });

    const targets: TComponentDropTarget[] = [];
    const guard: IComponentDropGuard = {
        evaluateDrop(target) {
            targets.push(target);
            return decision;
        },
    };

    let slot: IUseSlotDragDropReturn | null = null;

    const wrapper = mount(
        defineComponent({
            setup() {
                slot = useSlotDragDrop(PARENT_ID);
                return () => h('div');
            },
        }),
        { global: { provide: { [COMPONENT_DROP_GUARD_KEY as symbol]: guard } } }
    );

    // The assignment happens inside setup(), which the control flow analysis of the
    // compiler does not follow: without the cast the holder narrows to `never`
    const api = slot as IUseSlotDragDropReturn | null;

    if (!api) {
        throw new Error('The composable returned no API');
    }

    const attach = api.setSlotContainerRef(SLOT_NAME) as (
        element: unknown,
        refs: Record<string, unknown>
    ) => void;
    attach(container, {});

    return { slot: api, container, drops, targets, unmount: () => wrapper.unmount() };
}

describe('useSlotDragDrop: the verdict of the host', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('a refused slot shows no insertion point and lets no drop out', () => {
        const { slot, drops, targets, unmount } = mountSlot({
            allowed: false,
            reason: 'slot-capacity',
        });

        slot.handleSlotDragEnter(SLOT_NAME, createDragEvent());

        expect(targets).toEqual([{ kind: 'slot', parentId: PARENT_ID, slotName: SLOT_NAME }]);
        expect(slot.getSlotDropIndex(SLOT_NAME)).toBeNull();

        slot.handleSlotDragOver(SLOT_NAME, createDragEvent());
        expect(slot.getSlotDropIndex(SLOT_NAME)).toBeNull();

        slot.handleSlotDrop(SLOT_NAME, createDragEvent());
        expect(drops).toEqual([]);

        unmount();
    });

    it.each([
        ['permitted', { allowed: true } as TComponentPlacementDecision],
        ['refused', { allowed: false, reason: 'slot-capacity' } as TComponentPlacementDecision],
    ])('a %s slot takes down the refusal mark of the layout around it', (_label, decision) => {
        const { slot, unmount } = mountSlot(decision);
        const layout = document.getElementById('layout') as HTMLElement;
        layout.dataset.layoutDropRefusal = 'grid-capacity';

        slot.handleSlotDragOver(SLOT_NAME, createDragEvent());

        expect(layout.hasAttribute('data-layout-drop-refusal')).toBe(false);

        unmount();
    });

    it('a permitted slot marks the insertion point and dispatches the drop once', () => {
        const { slot, drops, unmount } = mountSlot({ allowed: true });

        slot.handleSlotDragEnter(SLOT_NAME, createDragEvent());
        expect(slot.getSlotDropIndex(SLOT_NAME)).toBe(0);

        slot.handleSlotDrop(SLOT_NAME, createDragEvent());

        expect(drops).toHaveLength(1);
        expect(drops[0]).toMatchObject({
            parentId: PARENT_ID,
            slotName: SLOT_NAME,
            movedComponentId: 'moved-1',
        });

        unmount();
    });
});
