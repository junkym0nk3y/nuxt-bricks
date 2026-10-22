/**
 * The rule for a component that is not in the schema yet — a block dragged in from the
 * library. It shares the destination checks with the move rule (see
 * `componentMovePolicy.spec.ts`) and has none of the source ones: there is no source.
 */

// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Types
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';

// Utils
import { evaluateComponentInsertion } from '../../src/runtime/modules/builder/core/utils/componentMovePolicy';
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

/**
 * A block dragged in from the library is not in the schema yet, so the move rule has no
 * source to judge — and the drop zones let every such drag through because of that. The
 * destination, however, refuses a new block on exactly the same grounds as a moved one.
 */
describe('evaluateComponentInsertion: a component that is not in the schema yet', () => {
    it('refuses an occupied single slot and allows a free one', () => {
        const host = makeBrick('host', {
            slots: [
                { name: 'taken', label: 'Taken', allowMultiple: false, children: ['child'] },
                { name: 'free', label: 'Free', allowMultiple: false, children: [] },
            ],
        });
        const child = makeBrick('child', { parent: 'host', slotName: 'taken' });

        expect(
            evaluateComponentInsertion({
                components: [host, child],
                destination: { kind: 'slot', parentId: 'host', slotName: 'taken' },
            })
        ).toEqual({ allowed: false, reason: 'slot-capacity' });

        expect(
            evaluateComponentInsertion({
                components: [host, child],
                destination: { kind: 'slot', parentId: 'host', slotName: 'free' },
            })
        ).toEqual({ allowed: true });
    });

    it('refuses a full Grid of the named viewport', () => {
        const full = makeGrid('grid', { props: { rows: 1, columns: 1 }, children: ['first'] });
        const first = makeGrid('first', { parent: 'grid' });

        expect(
            evaluateComponentInsertion({
                components: [full, first],
                destination: { kind: 'layout', parentId: 'grid' },
                viewport: 'desktop',
            })
        ).toEqual({ allowed: false, reason: 'grid-capacity' });
    });

    it('refuses a leaf block as the parent', () => {
        const leaf = makeBrick('leaf', { type: 'layout', componentName: 'Text' });

        expect(
            evaluateComponentInsertion({
                components: [leaf],
                destination: { kind: 'layout', parentId: 'leaf' },
            })
        ).toEqual({ allowed: false, reason: 'target-not-container' });
    });

    it('counts the depth of a leaf, not of a travelling subtree', () => {
        // The deepest link of the chain sits at the depth of the limit minus one: a new
        // leaf under it would reach the limit itself, and the contract refuses that depth.
        // One link higher there is still room — unlike a move, where the height of the
        // travelling subtree is added on top
        const chain = makeGridChain(MAX_COMPONENT_TREE_DEPTH);
        const deepest = chain[chain.length - 1];
        const parent = chain[chain.length - 2];

        expect(
            evaluateComponentInsertion({
                components: chain,
                destination: { kind: 'layout', parentId: parent.id },
            })
        ).toEqual({ allowed: true });

        expect(
            evaluateComponentInsertion({
                components: chain,
                destination: { kind: 'layout', parentId: deepest.id },
            })
        ).toEqual({ allowed: false, reason: 'depth-limit' });
    });

    it('allows the root level', () => {
        expect(
            evaluateComponentInsertion({
                components: [makeGrid('grid')],
                destination: { kind: 'root' },
            })
        ).toEqual({ allowed: true });
    });
});
