/**
 * @vitest-environment happy-dom
 *
 * A refusal of the guard used to be indistinguishable from "this is not a
 * layout": the caller travelled into the brick resolver with a path like
 * `layout/grid`, the resolver answered undefined without a word, and the editor
 * of a corrupted page got the placeholder "the component is missing from the
 * library, update bricks or the schema" — a wrong diagnosis, with nothing at all
 * reaching the log. What is checked here is exactly what is shown.
 *
 * The diagnosis itself belongs to the preview: `render` carries no locales, so the
 * texts arrive as `placeholderLabels` from the surface that has a translator, and a
 * published page passes none — a visitor gets an empty node that only holds the
 * place in the grid.
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
import { buildRendererComponentIndex } from '../../src/runtime/modules/render/utils/componentIndex';

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

/**
 * Brick component of a schema with no loader behind it.
 */
function makeBrick(): IBricksComponent {
    return {
        id: 'ui',
        type: 'component',
        componentName: 'TestBrick',
        brickPath: 'bricks/TestBrick',
        zIndex: 0,
        props: {},
    };
}

/** Diagnostics of the preview surface: what the editor is shown. */
const LABELS = {
    title: (componentName: string) => `${componentName} is unavailable`,
    missingBrick: 'The component is missing from the library.',
};

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
            props: {
                component: a,
                componentIndex: buildRendererComponentIndex([a, b]),
                placeholderLabels: LABELS,
            },
        });

        expect(findImportModuleMock).not.toHaveBeenCalled();
        expect(wrapper.html()).not.toContain('missing from the library');
        expect(wrapper.html()).toContain('Grid is unavailable');
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('Layout block refused'),
            expect.objectContaining({ reason: 'cycle' })
        );
    });

    it('keeps the library diagnosis for a brick component without a loader', () => {
        const wrapper = mount(TheRenderer, {
            props: {
                component: makeBrick(),
                componentIndex: buildRendererComponentIndex([makeBrick()]),
                placeholderLabels: LABELS,
            },
        });

        expect(findImportModuleMock).toHaveBeenCalledWith('bricks/TestBrick');
        expect(wrapper.html()).toContain('missing from the library');
    });

    // A visitor of a published page is not told which brick failed to resolve: the
    // texts are an editor affordance, and `render` has no language to say them in
    it('without labels leaves an empty node in place of the component', () => {
        const brick = makeBrick();
        const wrapper = mount(TheRenderer, {
            props: { component: brick, componentIndex: buildRendererComponentIndex([brick]) },
        });

        expect(wrapper.html()).not.toContain('unavailable');
        expect(wrapper.html()).not.toContain('missing from the library');
        expect(wrapper.find('[aria-hidden="true"]').exists()).toBe(true);
    });

    // The placeholder used to hold the grid placement, and the empty node has to hold
    // it too: without the placement a neighbor of the failed cell slides into it
    it('the empty node keeps the grid placement and the html id', () => {
        const brick = { ...makeBrick(), htmlId: 'promo', gridColumn: '2 / 4', gridRow: '1 / 2' };
        const wrapper = mount(TheRenderer, {
            props: { component: brick, componentIndex: buildRendererComponentIndex([brick]) },
        });

        const node = wrapper.find('#promo');

        expect(node.exists()).toBe(true);
        expect(node.attributes('style')).toContain('grid-column: 2 / 4');
        expect(node.attributes('style')).toContain('grid-row: 1 / 2');
    });
});
