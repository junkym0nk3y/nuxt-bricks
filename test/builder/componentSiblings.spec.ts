// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Types
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';

// Utils
import { resolveComponentSiblingContext } from '../../src/runtime/modules/builder/core/utils/componentSiblings';
// #endregion

// #region Helpers
/**
 * A schema component: the sibling resolver only looks at the id, the links and the
 * children lists.
 *
 * @param id - Id of the component.
 * @param overrides - Fields on top of the defaults.
 */
function buildComponent(id: string, overrides: Partial<IBricksComponent> = {}): IBricksComponent {
    return {
        id,
        type: 'layout',
        componentName: 'Grid',
        brickPath: 'layout/grid',
        zIndex: 1,
        props: {},
        ...overrides,
    };
}

/**
 * A brick component carrying one slot with its children.
 *
 * @param id - Id of the slot owner.
 * @param slotName - Name of the slot.
 * @param children - Children of the slot in display order.
 */
function buildSlotOwner(id: string, slotName: string, children: string[]): IBricksComponent {
    return buildComponent(id, {
        type: 'component',
        componentName: 'SlotOwner',
        brickPath: 'components/SlotOwner.vue',
        children: undefined,
        slots: [{ name: slotName, label: slotName, allowMultiple: true, children }],
    });
}
// #endregion

describe('resolveComponentSiblingContext', () => {
    it('gives the root position out of the flat list and no array to mutate', () => {
        const components = [buildComponent('a'), buildComponent('b'), buildComponent('c')];

        expect(resolveComponentSiblingContext(components, 'b')).toEqual({
            destination: { kind: 'root' },
            index: 1,
            count: 3,
            children: null,
        });
    });

    it('gives the LIVE children array of the parent for a child of a layout', () => {
        const parent = buildComponent('parent', { children: ['x', 'y'] });
        const components = [
            parent,
            buildComponent('x', { parent: 'parent' }),
            buildComponent('y', { parent: 'parent' }),
        ];

        const context = resolveComponentSiblingContext(components, 'y');

        expect(context?.destination).toEqual({ kind: 'layout', parentId: 'parent' });
        expect(context?.index).toBe(1);
        expect(context?.count).toBe(2);
        expect(context?.children).toBe(parent.children);
    });

    it('gives the LIVE children of the slot for a child of a slot, not those of the parent', () => {
        const owner = buildSlotOwner('owner', 'body', ['first', 'second']);
        const components = [
            owner,
            buildComponent('first', { parent: 'owner', slotName: 'body' }),
            buildComponent('second', { parent: 'owner', slotName: 'body' }),
        ];

        const context = resolveComponentSiblingContext(components, 'second');

        expect(context?.destination).toEqual({
            kind: 'slot',
            parentId: 'owner',
            slotName: 'body',
        });
        expect(context?.index).toBe(1);
        expect(context?.count).toBe(2);
        expect(context?.children).toBe(owner.slots?.[0]?.children);
    });

    it('has no place in the graph for an unknown component or a lost parent', () => {
        const components = [buildComponent('a'), buildComponent('orphan', { parent: 'ghost' })];

        expect(resolveComponentSiblingContext(components, 'missing')).toBeNull();
        expect(resolveComponentSiblingContext(components, 'orphan')).toBeNull();
    });

    it('follows the list that names the child, not a stale slotName', () => {
        // An imported page may carry a slotName the schema contract never validates.
        // The list of the parent is what the interface renders from, so a child of a
        // container keeps its neighbors whatever the back-reference says
        const parent = buildComponent('parent', { children: ['stray', 'other'] });
        const components = [
            parent,
            buildComponent('stray', { parent: 'parent', slotName: 'body' }),
            buildComponent('other', { parent: 'parent' }),
        ];

        const context = resolveComponentSiblingContext(components, 'stray');

        expect(context?.destination).toEqual({ kind: 'layout', parentId: 'parent' });
        expect(context?.children).toBe(parent.children);
    });

    it('finds a child of a slot whose slotName went missing', () => {
        const owner = buildSlotOwner('owner', 'body', ['first', 'second']);
        const components = [
            owner,
            buildComponent('first', { parent: 'owner' }),
            buildComponent('second', { parent: 'owner', slotName: 'body' }),
        ];

        expect(resolveComponentSiblingContext(components, 'first')?.destination).toEqual({
            kind: 'slot',
            parentId: 'owner',
            slotName: 'body',
        });
    });

    it('has no siblings for a child named by two lists of one parent', () => {
        // Rearranging one of the two lists would write the damage down instead of it
        // being repaired, and which of them the user sees is not decidable here
        const parent = buildComponent('parent', {
            children: ['twice'],
            slots: [{ name: 'body', label: 'body', allowMultiple: true, children: ['twice'] }],
        });
        const components = [parent, buildComponent('twice', { parent: 'parent' })];

        expect(resolveComponentSiblingContext(components, 'twice')).toBeNull();
    });

    it('keeps a root component with a stale slotName at the root level', () => {
        // At the root there is no second link to contradict: refusing here would turn a
        // stale field of an imported schema into a block that cannot be reordered
        const components = [
            buildComponent('a'),
            buildComponent('b', { slotName: 'body' }),
            buildComponent('c'),
        ];

        expect(resolveComponentSiblingContext(components, 'b')).toEqual({
            destination: { kind: 'root' },
            index: 1,
            count: 3,
            children: null,
        });
    });
});
