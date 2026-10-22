/**
 * The rule of a permitted move used to exist nowhere: the store rewrote `parent`
 * and `children` without looking at a cycle, at the depth or at the capacity, the
 * canvas guarded only a drop onto the block itself, and the schema tree drew an
 * indicator over a target that would do nothing. The matrix below is the whole
 * rule; every surface asks this one function.
 */

// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Types
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';

// Utils
import { evaluateComponentMove } from '../../src/runtime/modules/builder/core/utils/componentMovePolicy';
import { MAX_COMPONENT_TREE_DEPTH } from '../../src/runtime/modules/common/utils/bricks/schemaContract';
// #endregion

/**
 * A Grid block: a container of the registry, so it accepts children.
 *
 * @param id - Component id.
 * @param overrides - Fields to override.
 */
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

/**
 * A brick component: not a container of the registry.
 *
 * @param id - Component id.
 * @param overrides - Fields to override.
 */
function makeBrick(id: string, overrides: Partial<IBricksComponent> = {}): IBricksComponent {
    return {
        id,
        type: 'component',
        componentName: 'TestBrick',
        brickPath: 'bricks/TestBrick',
        zIndex: 0,
        props: {},
        ...overrides,
    };
}

/**
 * Builds a chain of nested Grids of the given length: `n0` is the root one.
 *
 * @param length - Number of components in the chain.
 */
function makeGridChain(length: number): IBricksComponent[] {
    return Array.from({ length }, (_unused, index) =>
        makeGrid(`n${index}`, {
            children: index < length - 1 ? [`n${index + 1}`] : [],
            ...(index > 0 ? { parent: `n${index - 1}` } : {}),
        })
    );
}

describe('evaluateComponentMove: integrity of the graph', () => {
    it('refuses a move of a component into itself', () => {
        const grid = makeGrid('a');

        expect(
            evaluateComponentMove({
                components: [grid],
                sourceId: 'a',
                destination: { kind: 'layout', parentId: 'a' },
            })
        ).toEqual({ allowed: false, reason: 'self' });
    });

    it('refuses a move of an ancestor into its own descendant', () => {
        const outer = makeGrid('outer', { children: ['inner'] });
        const inner = makeGrid('inner', { parent: 'outer' });

        expect(
            evaluateComponentMove({
                components: [outer, inner],
                sourceId: 'outer',
                destination: { kind: 'layout', parentId: 'inner' },
            })
        ).toEqual({ allowed: false, reason: 'descendant' });
    });

    it('sees a descendant that is only listed in a slot', () => {
        // The tree of the sidebar is built out of `children`, so a slot child is
        // invisible there — and a rule reading `children` alone would let the
        // ancestor into it
        const owner = makeBrick('owner', {
            slots: [{ name: 'default', children: ['nested'] }],
        });
        const nested = makeGrid('nested', { parent: 'owner' });
        const moved = makeGrid('moved', { children: ['owner'] });

        expect(
            evaluateComponentMove({
                components: [moved, owner, nested],
                sourceId: 'moved',
                destination: { kind: 'layout', parentId: 'nested' },
            })
        ).toEqual({ allowed: false, reason: 'descendant' });
    });

    it('sees a descendant that is linked only by the parent field of the child', () => {
        // A hand-imported schema and a draft interrupted midway go out of sync:
        // the child names its parent, the parent does not list the child
        const outer = makeGrid('outer', { children: [] });
        const inner = makeGrid('inner', { parent: 'outer' });

        expect(
            evaluateComponentMove({
                components: [outer, inner],
                sourceId: 'outer',
                destination: { kind: 'layout', parentId: 'inner' },
            })
        ).toEqual({ allowed: false, reason: 'descendant' });
    });

    it('refuses a move when the subtree being moved already holds a cycle', () => {
        const first = makeGrid('first', { children: ['second'] });
        const second = makeGrid('second', { children: ['first'], parent: 'first' });
        const target = makeGrid('target');

        expect(
            evaluateComponentMove({
                components: [first, second, target],
                sourceId: 'first',
                destination: { kind: 'layout', parentId: 'target' },
            })
        ).toEqual({ allowed: false, reason: 'invalid-graph' });
    });

    it('refuses to move a block that lists itself among its own children', () => {
        // A self-reference is the same corrupted draft: dropping the edge would give
        // the walk a height instead of a cycle, and the move would be permitted
        const selfReferencing = makeGrid('self', { children: ['self'] });
        const target = makeGrid('target');

        expect(
            evaluateComponentMove({
                components: [selfReferencing, target],
                sourceId: 'self',
                destination: { kind: 'layout', parentId: 'target' },
            })
        ).toEqual({ allowed: false, reason: 'invalid-graph' });
    });

    it('names the missing component instead of guessing', () => {
        const grid = makeGrid('a');

        expect(
            evaluateComponentMove({
                components: [grid],
                sourceId: 'ghost',
                destination: { kind: 'layout', parentId: 'a' },
            })
        ).toEqual({ allowed: false, reason: 'source-not-found' });

        expect(
            evaluateComponentMove({
                components: [grid],
                sourceId: 'a',
                destination: { kind: 'layout', parentId: 'ghost' },
            })
        ).toEqual({ allowed: false, reason: 'target-not-found' });
    });
});

describe('evaluateComponentMove: the destination', () => {
    it('refuses a leaf block as a parent even when its type is layout', () => {
        const text = makeGrid('text', { componentName: 'Text', brickPath: 'layout/text' });
        const moved = makeGrid('moved');

        expect(
            evaluateComponentMove({
                components: [text, moved],
                sourceId: 'moved',
                destination: { kind: 'layout', parentId: 'text' },
            })
        ).toEqual({ allowed: false, reason: 'target-not-container' });
    });

    it('allows a move to the root level from anywhere', () => {
        const chain = makeGridChain(3);

        expect(
            evaluateComponentMove({
                components: chain,
                sourceId: 'n2',
                destination: { kind: 'root' },
            })
        ).toEqual({ allowed: true });
    });

    it('refuses a slot that does not exist and one that is already taken', () => {
        const owner = makeBrick('owner', {
            slots: [
                { name: 'single', children: ['taken'], allowMultiple: false },
                { name: 'many', children: ['taken'] },
            ],
        });
        const taken = makeGrid('taken', { parent: 'owner' });
        const moved = makeGrid('moved');
        const components = [owner, taken, moved];

        expect(
            evaluateComponentMove({
                components,
                sourceId: 'moved',
                destination: { kind: 'slot', parentId: 'owner', slotName: 'ghost' },
            })
        ).toEqual({ allowed: false, reason: 'slot-not-found' });

        expect(
            evaluateComponentMove({
                components,
                sourceId: 'moved',
                destination: { kind: 'slot', parentId: 'owner', slotName: 'single' },
            })
        ).toEqual({ allowed: false, reason: 'slot-capacity' });

        // A rearrangement of the one already standing in the slot is not an arrival
        expect(
            evaluateComponentMove({
                components,
                sourceId: 'taken',
                destination: { kind: 'slot', parentId: 'owner', slotName: 'single' },
            })
        ).toEqual({ allowed: true });

        expect(
            evaluateComponentMove({
                components,
                sourceId: 'moved',
                destination: { kind: 'slot', parentId: 'owner', slotName: 'many' },
            })
        ).toEqual({ allowed: true });
    });
});

describe('evaluateComponentMove: the depth limit', () => {
    it('counts the height of the subtree being moved, not the destination alone', () => {
        // The destination on its own leaves room for two more levels, but the
        // moved subtree is three levels tall
        const destinationDepth = MAX_COMPONENT_TREE_DEPTH - 3;
        const chain = makeGridChain(destinationDepth + 1);
        const movedRoot = makeGrid('moved', { children: ['moved-child'] });
        const movedChild = makeGrid('moved-child', {
            children: ['moved-grandchild'],
            parent: 'moved',
        });
        const movedGrandchild = makeGrid('moved-grandchild', { parent: 'moved-child' });
        const components = [...chain, movedRoot, movedChild, movedGrandchild];
        const deepestId = `n${destinationDepth}`;

        expect(
            evaluateComponentMove({
                components,
                sourceId: 'moved',
                destination: { kind: 'layout', parentId: deepestId },
            })
        ).toEqual({ allowed: false, reason: 'depth-limit' });

        // A single component of the same subtree fits into the same place
        expect(
            evaluateComponentMove({
                components,
                sourceId: 'moved-grandchild',
                destination: { kind: 'layout', parentId: deepestId },
            })
        ).toEqual({ allowed: true });
    });

    it('refuses the depth equal to the limit and allows the one right below it', () => {
        const atLimit = makeGridChain(MAX_COMPONENT_TREE_DEPTH);
        const moved = makeGrid('moved');

        // The deepest component of the chain sits at depth limit - 1, so a child of
        // it would be exactly at the limit
        expect(
            evaluateComponentMove({
                components: [...atLimit, moved],
                sourceId: 'moved',
                destination: {
                    kind: 'layout',
                    parentId: `n${MAX_COMPONENT_TREE_DEPTH - 1}`,
                },
            })
        ).toEqual({ allowed: false, reason: 'depth-limit' });

        expect(
            evaluateComponentMove({
                components: [...atLimit, moved],
                sourceId: 'moved',
                destination: {
                    kind: 'layout',
                    parentId: `n${MAX_COMPONENT_TREE_DEPTH - 2}`,
                },
            })
        ).toEqual({ allowed: true });
    });
});

describe('evaluateComponentMove: the capacity of a Grid', () => {
    it('refuses a newcomer into a full Grid and allows its own child to be rearranged', () => {
        const full = makeGrid('grid', {
            props: { rows: 1, columns: 2 },
            children: ['first', 'second'],
        });
        const first = makeGrid('first', { parent: 'grid' });
        const second = makeGrid('second', { parent: 'grid' });
        const outsider = makeGrid('outsider');
        const components = [full, first, second, outsider];

        expect(
            evaluateComponentMove({
                components,
                sourceId: 'outsider',
                destination: { kind: 'layout', parentId: 'grid' },
                viewport: 'desktop',
            })
        ).toEqual({ allowed: false, reason: 'grid-capacity' });

        expect(
            evaluateComponentMove({
                components,
                sourceId: 'first',
                destination: { kind: 'layout', parentId: 'grid' },
                viewport: 'desktop',
            })
        ).toEqual({ allowed: true });
    });

    it('counts the cells of the named viewport, respecting the responsive override', () => {
        const grid = makeGrid('grid', {
            props: { rows: 2, columns: 2, responsive: { mobile: { rows: 1, columns: 1 } } },
            children: ['first'],
        });
        const first = makeGrid('first', { parent: 'grid' });
        const outsider = makeGrid('outsider');
        const components = [grid, first, outsider];

        expect(
            evaluateComponentMove({
                components,
                sourceId: 'outsider',
                destination: { kind: 'layout', parentId: 'grid' },
                viewport: 'desktop',
            })
        ).toEqual({ allowed: true });

        expect(
            evaluateComponentMove({
                components,
                sourceId: 'outsider',
                destination: { kind: 'layout', parentId: 'grid' },
                viewport: 'mobile',
            })
        ).toEqual({ allowed: false, reason: 'grid-capacity' });
    });

    it('recognizes a Grid by the registry and not by the spelling of its name', () => {
        // A schema is free to name the block `grid`: the registry resolves the case
        // itself, so a comparison of its own would let a full grid through
        const full = makeGrid('grid', {
            componentName: 'grid',
            props: { rows: 1, columns: 1 },
            children: ['first'],
        });
        const first = makeGrid('first', { parent: 'grid' });
        const outsider = makeGrid('outsider');

        expect(
            evaluateComponentMove({
                components: [full, first, outsider],
                sourceId: 'outsider',
                destination: { kind: 'layout', parentId: 'grid' },
                viewport: 'desktop',
            })
        ).toEqual({ allowed: false, reason: 'grid-capacity' });
    });

    it('leaves the capacity unjudged when no viewport is named', () => {
        // That is the split of responsibilities: the store guards the integrity of
        // the graph for every surface at once and knows of no device, while the
        // cells of a Grid exist only within a viewport
        const full = makeGrid('grid', {
            props: { rows: 1, columns: 1 },
            children: ['first'],
        });
        const first = makeGrid('first', { parent: 'grid' });
        const outsider = makeGrid('outsider');

        expect(
            evaluateComponentMove({
                components: [full, first, outsider],
                sourceId: 'outsider',
                destination: { kind: 'layout', parentId: 'grid' },
            })
        ).toEqual({ allowed: true });
    });
});
