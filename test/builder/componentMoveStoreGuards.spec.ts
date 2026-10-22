/**
 * The store applies the rule of a permitted move itself, and not only the
 * surfaces do: an interface added later gets the invariant whether it asks for it
 * or not. What matters here is the price of a refusal — it has to cost nothing:
 * neither a changed schema, nor an entry in the history that undo would then
 * rewind into a move that never happened.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Types
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';

// Utils
import { MAX_COMPONENT_TREE_DEPTH } from '../../src/runtime/modules/common/utils/bricks/schemaContract';

// Stores
import { useComponentsStore } from '../../src/runtime/modules/builder/core/stores/components';
import { useHistoryStore } from '../../src/runtime/modules/builder/core/stores/history';
// #endregion

/** Grid block: a container of the registry. */
function buildGrid(id: string, overrides: Partial<IBricksComponent> = {}): IBricksComponent {
    return {
        id,
        type: 'layout',
        componentName: 'Grid',
        brickPath: 'layout/grid',
        zIndex: 1,
        props: { rows: 4, columns: 4 },
        children: [],
        ...overrides,
    };
}

/** Brick component: it may own slots, and it is not a container of the registry. */
function buildBrick(id: string, overrides: Partial<IBricksComponent> = {}): IBricksComponent {
    return {
        id,
        type: 'component',
        componentName: 'TestBrick',
        brickPath: 'bricks/TestBrick.brick.ts',
        zIndex: 1,
        props: {},
        ...overrides,
    };
}

describe('the store refuses a move that would corrupt the tree', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    it('leaves the schema and the history untouched when refusing an ancestor into its descendant', () => {
        const store = useComponentsStore();
        const historyStore = useHistoryStore();
        const outer = buildGrid('outer', { children: ['inner'] });
        const inner = buildGrid('inner', { parent: 'outer' });
        store.components = [outer, inner];
        const historyLength = historyStore.history.length;

        const result = store.moveComponentToLayout('inner', 'outer');

        expect(result).toEqual({ moved: false, reason: 'descendant' });
        expect(outer.parent).toBeUndefined();
        expect(outer.children).toEqual(['inner']);
        expect(inner.children).toEqual([]);
        // The history does not deduplicate identical snapshots, so an entry written
        // by a refusal would make undo rewind a move that never happened
        expect(historyStore.history.length).toBe(historyLength);
    });

    it('leaves a refused block with its old parent', () => {
        // The detach is the first write of the move, and a verdict passed after it
        // would leave the block with no parent at all — out of the tree, while the
        // user was told nothing happened
        const store = useComponentsStore();
        const outer = buildGrid('outer', { children: ['middle'] });
        const middle = buildGrid('middle', { parent: 'outer', children: ['inner'] });
        const inner = buildGrid('inner', { parent: 'middle' });
        store.components = [outer, middle, inner];

        const result = store.moveComponentToLayout('inner', 'middle');

        expect(result).toEqual({ moved: false, reason: 'descendant' });
        expect(middle.parent).toBe('outer');
        expect(outer.children).toEqual(['middle']);
        expect(inner.parent).toBe('middle');
    });

    it('refuses a leaf block as a parent', () => {
        const store = useComponentsStore();
        const text = buildGrid('text', { componentName: 'Text', brickPath: 'layout/text' });
        const moved = buildGrid('moved');
        store.components = [text, moved];

        expect(store.moveComponentToLayout('text', 'moved')).toEqual({
            moved: false,
            reason: 'target-not-container',
        });
        expect(moved.parent).toBeUndefined();
    });

    it('refuses a second block in a slot that holds one', () => {
        const store = useComponentsStore();
        const owner = buildBrick('owner', {
            slots: [{ name: 'single', children: ['taken'], allowMultiple: false }],
        });
        const taken = buildGrid('taken', { parent: 'owner', slotName: 'single' });
        const moved = buildGrid('moved');
        store.components = [owner, taken, moved];

        const result = store.moveComponentToSlot('owner', 'single', 'moved');

        expect(result).toEqual({ moved: false, reason: 'slot-capacity' });
        // The refusal comes before the detach: the block keeps its place instead of
        // being left with no parent at all
        expect(owner.slots?.[0].children).toEqual(['taken']);
        expect(moved.parent).toBeUndefined();
    });

    it('performs a permitted move and reports it', () => {
        const store = useComponentsStore();
        const target = buildGrid('target');
        const moved = buildGrid('moved');
        store.components = [target, moved];

        expect(store.moveComponentToLayout('target', 'moved')).toEqual({ moved: true });
        expect(target.children).toEqual(['moved']);
        expect(moved.parent).toBe('target');
    });
});

describe('every write into children goes through the rule', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    it('refuses to add a block into a container at the depth limit', () => {
        // `addChildToLayout` is the second way of writing into `children`, and a live
        // one: a new block out of the library and a paste of the clipboard travel
        // through it
        const store = useComponentsStore();
        const chain = Array.from({ length: MAX_COMPONENT_TREE_DEPTH }, (_unused, index) =>
            buildGrid(`n${index}`, {
                children: index < MAX_COMPONENT_TREE_DEPTH - 1 ? [`n${index + 1}`] : [],
                ...(index > 0 ? { parent: `n${index - 1}` } : {}),
            })
        );
        const added = buildGrid('added');
        store.components = [...chain, added];

        const deepest = `n${MAX_COMPONENT_TREE_DEPTH - 1}`;
        const result = store.addChildToLayout(deepest, 'added');

        expect(result).toEqual({ moved: false, reason: 'depth-limit' });
        expect(store.getComponentById(deepest)?.children).toEqual([]);
        expect(added.parent).toBeUndefined();
    });

    it('takes a block back without writing a history entry of its own', () => {
        // The rollback of a refused drop leans on this: the history does not
        // deduplicate identical snapshots, so a pair of them would make the first
        // undo look like it did nothing
        const store = useComponentsStore();
        const historyStore = useHistoryStore();
        const added = buildGrid('added');
        store.components = [added];
        store.saveToHistory();
        const historyLength = historyStore.history.length;

        store.removeComponent('added', { skipHistory: true });

        expect(store.components).toEqual([]);
        expect(historyStore.history.length).toBe(historyLength);
    });

    it('takes back the clones when the place they were meant for refuses them', () => {
        // The clipboard writes the clones into the store first and places them after:
        // a refusal used to leave blocks nobody references — invisible on the canvas
        // and enough for the schema contract to refuse the save
        const store = useComponentsStore();
        const owner = buildBrick('owner', {
            slots: [{ name: 'single', children: ['original'], allowMultiple: false }],
        });
        const original = buildGrid('original', { parent: 'owner', slotName: 'single' });
        store.components = [owner, original];

        store.copyComponentToClipboard('original');
        const pastedId = store.pasteFromClipboard();

        expect(pastedId).toBeUndefined();
        expect(store.components.map((component) => component.id)).toEqual(['owner', 'original']);
        expect(owner.slots?.[0].children).toEqual(['original']);
    });
});

describe('detaching a child does not carry off its neighbor', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    it('keeps the last child in place when the detached one lies in a slot', () => {
        // `children` does not list a slot child, and `indexOf` answered -1 — the
        // splice then carried off the LAST element of the list, someone else's block
        const store = useComponentsStore();
        const owner = buildBrick('owner', {
            children: ['neighbor'],
            slots: [{ name: 'default', children: ['nested'] }],
        });
        const neighbor = buildGrid('neighbor', { parent: 'owner' });
        const nested = buildGrid('nested', { parent: 'owner', slotName: 'default' });
        store.components = [owner, neighbor, nested];

        store.detachComponentFromParent('nested');

        expect(owner.children).toEqual(['neighbor']);
        expect(owner.slots?.[0].children).toEqual([]);
        expect(nested.parent).toBeUndefined();
        expect(nested.slotName).toBeUndefined();
    });
});
