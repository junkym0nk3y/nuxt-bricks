/**
 * @vitest-environment happy-dom
 *
 * A row of the schema tree has three landing zones: the edges put the block next
 * to it as a sibling, the middle puts it inside a container. Before that a nested
 * row accepted a drop and did nothing at all — it drew the indicator and emitted
 * the reorder, while the handler above looked the target up among the root
 * components only.
 *
 * What is checked here is the promise of the interface: a row must not show an
 * indicator over a target the store would refuse, and the position it reports has
 * to be the position under the cursor.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { ref } from 'vue';
import { mount } from '@vue/test-utils';

// Types
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';
// #endregion

// #region Mocks
const { componentsStoreMock } = vi.hoisted(() => ({
    componentsStoreMock: {
        components: [] as IBricksComponent[],
        isComponentSelected: () => false,
        getComponentById: (_id: string) => undefined as IBricksComponent | undefined,
        getRootComponents: () => [] as IBricksComponent[],
    },
}));

vi.mock('../../src/runtime/modules/builder/core/stores/components', () => ({
    useComponentsStore: () => componentsStoreMock,
}));

vi.mock('../../src/runtime/modules/builder/core/stores/canvas', () => ({
    useCanvasStore: () => ({
        viewport: 'desktop',
        devices: [{ key: 'desktop', label: 'Desktop', icon: 'desktop' }],
    }),
}));

// A real ref and not a plain object: the template unwraps only a ref, and
// `:draggable` would otherwise get the object itself
vi.mock('../../src/runtime/modules/builder/core/composables/useBuilderPermissions', () => ({
    useBuilderPermissions: () => ({ canEdit: ref(true) }),
}));
// #endregion

import BuilderShellSidebarSchemaTreeItem from '../../src/runtime/modules/builder/shell/sidebar/components/BuilderShellSidebarSchemaTreeItem.vue';

/** Grid block: a container of the registry, so it accepts children. */
function makeGrid(id: string, overrides: Partial<IBricksComponent> = {}): IBricksComponent {
    return {
        id,
        type: 'layout',
        componentName: 'Grid',
        brickPath: 'layout/grid',
        zIndex: 0,
        props: { rows: 4, columns: 4 },
        children: [],
        ...overrides,
    };
}

/** Text block: a layout block that holds no children. */
function makeText(id: string, overrides: Partial<IBricksComponent> = {}): IBricksComponent {
    return {
        ...makeGrid(id, overrides),
        componentName: 'Text',
        brickPath: 'layout/text',
        children: undefined,
    };
}

/**
 * Puts the schema into the store mock.
 *
 * @param components - Components of the schema.
 */
function useSchema(components: IBricksComponent[]): void {
    componentsStoreMock.components = components;
    componentsStoreMock.getComponentById = (id: string) =>
        components.find((component) => component.id === id);
    componentsStoreMock.getRootComponents = () =>
        components.filter((component) => !component.parent);
}

/**
 * Mounts one row of the tree.
 *
 * @param component - Component of the row.
 * @param depth - Nesting level of the row.
 */
function mountRow(component: IBricksComponent, depth = 0) {
    return mount(BuilderShellSidebarSchemaTreeItem, {
        props: { component, depth },
        global: { stubs: { BricksIcon: true } },
    });
}

/**
 * A drag event with a working preventDefault counter and a dataTransfer of its
 * own: happy-dom builds no DragEvent, and the landing zone is decided by the
 * cursor coordinates.
 *
 * @param type - Event type.
 * @param clientY - Cursor position.
 * @param payload - Id of the dragged row, as the payload of the drag.
 */
function makeDragEvent(type: string, clientY = 0, payload = 'dragged-id') {
    const event = new Event(type, { bubbles: true, cancelable: true }) as Event & {
        clientY: number;
        dataTransfer: {
            dropEffect: string;
            effectAllowed: string;
            types: string[];
            getData: () => string;
            setData: () => void;
        };
    };

    Object.defineProperty(event, 'clientY', { value: clientY });
    Object.defineProperty(event, 'dataTransfer', {
        value: {
            dropEffect: 'none',
            effectAllowed: 'none',
            types: ['tree-component-id'],
            getData: () => payload,
            setData: () => undefined,
        },
    });

    return event;
}

/**
 * Plays a drag of one row over another and returns what the target reported.
 *
 * happy-dom gives every element a zero-sized rect, so the row height is stubbed:
 * without it every offset would land in one and the same zone.
 *
 * @param target - Row the cursor is over.
 * @param offsetRatio - Where inside the row the cursor is (0 — the top edge).
 * @param depth - Nesting level of the target row.
 * @param draggedId - Row being dragged.
 */
async function dragOverRow(
    target: IBricksComponent,
    offsetRatio: number,
    depth = 0,
    draggedId = 'dragged-id'
) {
    const wrapper = mountRow(target, depth);
    const row = wrapper.get('button');

    row.element.getBoundingClientRect = () => ({ top: 0, height: 100 }) as unknown as DOMRect;

    // The dragged row is remembered by its own dragstart: `dragover` cannot read
    // the payload of the drag
    const source = mountRow(
        componentsStoreMock.components.find((item) => item.id === draggedId) ?? makeGrid(draggedId)
    );
    source.get('button').element.dispatchEvent(makeDragEvent('dragstart', 0, draggedId));

    const dragover = makeDragEvent('dragover', offsetRatio * 100, draggedId);
    row.element.dispatchEvent(dragover);
    await wrapper.vm.$nextTick();

    row.element.dispatchEvent(makeDragEvent('drop', offsetRatio * 100, draggedId));
    await wrapper.vm.$nextTick();

    return { wrapper, dragover, moves: wrapper.emitted('move') ?? [] };
}

describe('schema tree: the landing zones of a row', () => {
    beforeEach(() => {
        useSchema([]);
    });

    it('puts the block inside a container when the cursor is in the middle', async () => {
        const outer = makeGrid('outer', { children: ['first'] });
        const first = makeGrid('first', { parent: 'outer' });
        const dragged = makeGrid('dragged-id');
        useSchema([outer, first, dragged]);

        const { dragover, moves } = await dragOverRow(first, 0.5, 1);

        expect(dragover.defaultPrevented).toBe(true);
        expect(moves).toEqual([
            [
                {
                    sourceId: 'dragged-id',
                    destination: { kind: 'layout', parentId: 'first' },
                    targetIndex: 0,
                },
            ],
        ]);
    });

    it('puts the block next to a nested row when the cursor is at its edge', async () => {
        const outer = makeGrid('outer', { children: ['first', 'second'] });
        const first = makeGrid('first', { parent: 'outer' });
        const second = makeGrid('second', { parent: 'outer' });
        const dragged = makeGrid('dragged-id');
        useSchema([outer, first, second, dragged]);

        const { moves } = await dragOverRow(second, 0.9, 1);

        // A sibling after `second`, that is into the children of `outer` at index 2
        expect(moves).toEqual([
            [
                {
                    sourceId: 'dragged-id',
                    destination: { kind: 'layout', parentId: 'outer' },
                    targetIndex: 2,
                },
            ],
        ]);
    });

    it('keeps the root level for a root row', async () => {
        const first = makeGrid('first');
        const second = makeGrid('second');
        const dragged = makeGrid('dragged-id');
        useSchema([first, second, dragged]);

        const { moves } = await dragOverRow(second, 0.1);

        expect(moves).toEqual([
            [{ sourceId: 'dragged-id', destination: { kind: 'root' }, targetIndex: 1 }],
        ]);
    });

    it('gives a row that holds no children only the two edge zones', async () => {
        const text = makeText('text');
        const dragged = makeGrid('dragged-id');
        useSchema([text, dragged]);

        const { moves } = await dragOverRow(text, 0.5);

        // The middle of a leaf block is the second half of the row, that is `after`
        expect(moves).toEqual([
            [{ sourceId: 'dragged-id', destination: { kind: 'root' }, targetIndex: 1 }],
        ]);
    });
});

describe('schema tree: a refused drop promises nothing', () => {
    it('shows no indicator over a descendant of the dragged block', async () => {
        const dragged = makeGrid('dragged-id', { children: ['inner'] });
        const inner = makeGrid('inner', { parent: 'dragged-id' });
        useSchema([dragged, inner]);

        const { wrapper, dragover, moves } = await dragOverRow(inner, 0.5, 1);

        // Not accepting the event is what makes the browser show the "not allowed"
        // cursor instead of an indicator
        expect(dragover.defaultPrevented).toBe(false);
        expect(wrapper.html()).not.toContain('dropIndicator');
        expect(moves).toEqual([]);
    });

    it('shows no indicator over a full Grid', async () => {
        const full = makeGrid('full', {
            props: { rows: 1, columns: 1 },
            children: ['taken'],
        });
        const taken = makeGrid('taken', { parent: 'full' });
        const dragged = makeGrid('dragged-id');
        useSchema([full, taken, dragged]);

        const { dragover, moves } = await dragOverRow(full, 0.5);

        expect(dragover.defaultPrevented).toBe(false);
        expect(moves).toEqual([]);
    });

    it('shows no edge indicator over a row that lives in a slot', async () => {
        // The tree is built out of `children`, so a child of a slot has no row of its
        // own — but the row is what resolves the destination, and answering "next to
        // this one" for such a neighbor would take the block out of the slot into the
        // plain children of its owner
        const owner = makeGrid('owner', {
            componentName: 'SlotOwner',
            brickPath: 'components/SlotOwner.vue',
            type: 'component',
            children: undefined,
            slots: [{ name: 'body', label: 'body', allowMultiple: true, children: ['in-slot'] }],
        });
        const inSlot = makeText('in-slot', { parent: 'owner', slotName: 'body' });
        const dragged = makeGrid('dragged-id');
        useSchema([owner, inSlot, dragged]);

        const { wrapper, dragover, moves } = await dragOverRow(inSlot, 0.9, 1);

        expect(dragover.defaultPrevented).toBe(false);
        expect(wrapper.html()).not.toContain('dropIndicator');
        expect(moves).toEqual([]);
    });

    it('ignores a drag that did not start in the tree', async () => {
        const target = makeGrid('target');
        useSchema([target]);

        const wrapper = mountRow(target);
        const row = wrapper.get('button');
        row.element.getBoundingClientRect = () => ({ top: 0, height: 100 }) as unknown as DOMRect;

        const dragover = makeDragEvent('dragover', 50);
        Object.defineProperty(dragover.dataTransfer, 'types', { value: ['Files'] });
        row.element.dispatchEvent(dragover);
        await wrapper.vm.$nextTick();

        expect(dragover.defaultPrevented).toBe(false);
        expect(wrapper.emitted('move')).toBeUndefined();
    });
});
