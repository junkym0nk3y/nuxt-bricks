/**
 * @vitest-environment happy-dom
 *
 * A refusal of the guard used to be indistinguishable from "this is not a
 * layout": the caller travelled into the brick resolver with a path like
 * `layout/grid`, the resolver answered undefined without a word, and the visitor
 * of a corrupted page got the placeholder "the component is missing from the
 * library, update bricks or the schema" — a wrong diagnosis, with nothing at all
 * reaching the log. What is checked here is exactly what the visitor sees.
 */

// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { mount } from '@vue/test-utils';

// Types
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';
// #endregion

// #region Mocks
const { findImportModuleMock } = vi.hoisted(() => ({
    findImportModuleMock: vi.fn(() => undefined),
}));

vi.mock('../../src/runtime/modules/common/composables/useBrickImports', () => ({
    useBrickImports: () => ({
        findImportModule: findImportModuleMock,
        hasBrickModule: () => false,
    }),
}));
// #endregion

import TheRenderer from '../../src/runtime/modules/render/components/TheRenderer.vue';

/**
 * Grid component of a schema (registry name 'Grid', renderPublished — an eager
 * h('div')).
 */
function makeGrid(id: string, children: string[], parent?: string): IBricksComponent {
    return {
        id,
        type: 'layout',
        componentName: 'Grid',
        brickPath: 'layout/grid',
        zIndex: 0,
        props: {},
        children,
        ...(parent ? { parent } : {}),
    };
}

describe('TheRenderer: a layout block refused over a cycle', () => {
    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        findImportModuleMock.mockClear();
    });

    it('does not travel into the brick resolver and shows no library diagnosis', () => {
        const a = makeGrid('a', ['b'], 'b');
        const b = makeGrid('b', ['a'], 'a');

        const wrapper = mount(TheRenderer, {
            props: { component: a, allComponents: [a, b] },
        });

        expect(findImportModuleMock).not.toHaveBeenCalled();
        expect(wrapper.html()).not.toContain('не найден в библиотеке');
        expect(wrapper.html()).toContain('Grid недоступен');
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('Layout block refused'),
            expect.objectContaining({ reason: 'cycle' })
        );
    });

    it('keeps the library diagnosis for a brick component without a loader', () => {
        const brick: IBricksComponent = {
            id: 'ui',
            type: 'component',
            componentName: 'TestBrick',
            brickPath: 'bricks/TestBrick',
            zIndex: 0,
            props: {},
        };

        const wrapper = mount(TheRenderer, {
            props: { component: brick, allComponents: [brick] },
        });

        expect(findImportModuleMock).toHaveBeenCalledWith('bricks/TestBrick');
        expect(wrapper.html()).toContain('не найден в библиотеке');
    });
});
