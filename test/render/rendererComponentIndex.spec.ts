/**
 * Resolving child references used to be a linear `find` over the whole component
 * list. Replacing it with a map is only equivalent under two conditions, and both
 * are easy to lose in the rewrite: `find` answers with the FIRST component of a
 * repeated id (a plain `new Map(list.map(...))` keeps the last one), and it reads
 * the list at call time, so a block that renders its children later — the slider
 * calls renderSlide from its own `.vue` long after renderPublished returned — sees
 * the schema the live preview has replaced, not the one from when the page mounted.
 */

// #region Imports
// Types
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';
import type { TRendererLayoutResult } from '../../src/runtime/modules/render/types/render';

// Vue
import { computed, h, ref } from 'vue';

// Vitest
import { describe, expect, it } from 'vitest';

// Composables
import { useRendererLayouts } from '../../src/runtime/modules/render/composables/useRendererLayouts';
import { buildRendererComponentIndex } from '../../src/runtime/modules/render/utils/componentIndex';
// #endregion

/**
 * Grid component of a schema (registry name 'Grid', renderPublished — an eager
 * h('div') that asks for its children through getChildComponents).
 */
function makeGrid(id: string, children: string[], htmlId?: string): IBricksComponent {
    return {
        id,
        type: 'layout',
        componentName: 'Grid',
        brickPath: 'layout/grid',
        zIndex: 0,
        props: {},
        children,
        ...(htmlId ? { htmlId } : {}),
    };
}

/**
 * Builds the composable over a replaceable list of components and records the
 * components its children actually resolved to.
 *
 * The list is behind a ref rather than a constant: a captured index and one read at
 * call time answer the same until the schema is replaced.
 */
function createHarness(initialComponents: IBricksComponent[]) {
    const components = ref<IBricksComponent[]>(initialComponents);
    const rendered: IBricksComponent[] = [];
    let renderLayout: (component: IBricksComponent) => TRendererLayoutResult = () => ({
        kind: 'not-layout',
    });

    const api = useRendererLayouts({
        componentIndex: computed(() => buildRendererComponentIndex(components.value)),
        styles: {},
        renderChild: (child: IBricksComponent) => {
            rendered.push(child);

            const result = renderLayout(child);

            return result.kind === 'rendered' ? result.vnode : h('div');
        },
    });

    renderLayout = api.renderLayoutComponent;

    return { api, components, rendered };
}

describe('renderer component index', () => {
    it('resolves a repeated id to the first component of the list', () => {
        const first = makeGrid('duplicate', [], 'first');
        const second = makeGrid('duplicate', [], 'second');
        const parent = makeGrid('parent', ['duplicate']);
        const { api, rendered } = createHarness([parent, first, second]);

        api.renderLayoutComponent(parent);

        expect(rendered).toEqual([first]);
    });

    it('reads the index at call time, so a replaced schema reaches a deferred render', () => {
        const initialChild = makeGrid('child', [], 'initial');
        const parent = makeGrid('parent', ['child']);
        const { api, components, rendered } = createHarness([parent, initialChild]);

        api.renderLayoutComponent(parent);

        const replacedChild = makeGrid('child', [], 'replaced');
        components.value = [parent, replacedChild];
        api.renderLayoutComponent(parent);

        expect(rendered).toEqual([initialChild, replacedChild]);
    });
});
