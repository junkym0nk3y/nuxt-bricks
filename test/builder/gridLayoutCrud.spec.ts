// #region Imports
// Vitest
import { beforeEach, describe, expect, it } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Types
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';

// Stores
import { useComponentsStore } from '../../src/runtime/modules/builder/core/stores/components';
// #endregion

/** Builds a minimal canvas component with fixture overrides */
function buildComponent(overrides: Partial<IBricksComponent> = {}): IBricksComponent {
    return {
        id: 'component-1',
        type: 'component',
        componentName: 'TestBrick',
        brickPath: 'bricks/TestBrick.brick.ts',
        zIndex: 1,
        props: {},
        ...overrides,
    };
}

describe('Grid layout CRUD', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('preserves grid coordinates when adding a child to schema-cased Grid', () => {
        const store = useComponentsStore();
        const layout = buildComponent({
            id: 'grid-1',
            type: 'layout',
            componentName: 'Grid',
            brickPath: 'layout/Grid',
            children: [],
        });
        const child = buildComponent({ gridColumn: '2 / 4', gridRow: '3' });
        store.components = [layout, child];

        store.addChildToLayout(layout.id, child.id);

        expect(child.gridColumn).toBe('2 / 4');
        expect(child.gridRow).toBe('3');
    });

    it('preserves grid coordinates when moving inside schema-cased Grid', () => {
        const store = useComponentsStore();
        const child = buildComponent({
            parent: 'grid-1',
            gridColumn: '2 / 4',
            gridRow: '3',
        });
        const layout = buildComponent({
            id: 'grid-1',
            type: 'layout',
            componentName: 'Grid',
            brickPath: 'layout/Grid',
            children: [child.id],
        });
        store.components = [layout, child];

        store.moveComponentToLayout(layout.id, child.id);

        expect(child.gridColumn).toBe('2 / 4');
        expect(child.gridRow).toBe('3');
    });
});
