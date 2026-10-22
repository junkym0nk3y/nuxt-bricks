/**
 * @vitest-environment happy-dom
 *
 * A brick rendered on the server registers the key of its brick file with the SSR
 * response. The SFC of the brick registers its own `.vue` id, but the client manifest
 * keys the chunk by the brick file — the target of the dynamic import — so without the
 * registration a response that links styles instead of inlining them carried none of
 * the stylesheets of the brick.
 */

// #region Imports
// Types
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';

// Vitest
import { afterEach, describe, expect, it, vi } from 'vitest';

// Vue
import { ssrContextKey } from 'vue';
import { mount } from '@vue/test-utils';
// #endregion

// #region Mocks
vi.mock('../../src/runtime/modules/common/composables/useBrickImports', () => ({
    useBrickImports: () => ({
        findImportModule: () => () => Promise.resolve({ default: { render: () => null } }),
        hasBrickModule: () => true,
    }),
}));
// #endregion

import TheRenderer from '../../src/runtime/modules/render/components/TheRenderer.vue';
import { buildRendererComponentIndex } from '../../src/runtime/modules/render/utils/componentIndex';

/** A schema component of a consumer brick */
const BRICK: IBricksComponent = {
    id: 'card',
    type: 'component',
    componentName: 'Card',
    brickPath: '/components/cards/SsrCard.brick.ts',
    zIndex: 0,
    props: {},
    children: [],
};

/**
 * Mounts the renderer over the brick with an SSR context provided.
 *
 * @param ssrContext - The SSR context Vue hands to the render.
 */
function mountWithSsrContext(ssrContext: Record<string, unknown>) {
    return mount(TheRenderer, {
        props: { component: BRICK, componentIndex: buildRendererComponentIndex([BRICK]) },
        global: { provide: { [ssrContextKey as symbol]: ssrContext } },
    });
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('TheRenderer on the server', () => {
    it('registers the key of the brick file with the SSR response', () => {
        vi.stubGlobal('__BRICKS_TEST_SERVER__', true);
        const modules = new Set(['../src/runtime/modules/render/pages/[pagename].vue']);

        mountWithSsrContext({ modules });

        expect([...modules]).toEqual([
            '../src/runtime/modules/render/pages/[pagename].vue',
            'components/cards/SsrCard.brick.ts',
        ]);
    });

    it('starts the set of modules when the context has none yet', () => {
        vi.stubGlobal('__BRICKS_TEST_SERVER__', true);
        const ssrContext: { modules?: Set<string> } = {};

        mountWithSsrContext(ssrContext);

        expect(ssrContext.modules).toEqual(new Set(['components/cards/SsrCard.brick.ts']));
    });

    it('registers nothing in the browser', () => {
        const ssrContext: { modules?: Set<string> } = {};

        mountWithSsrContext(ssrContext);

        expect(ssrContext.modules).toBeUndefined();
    });
});
