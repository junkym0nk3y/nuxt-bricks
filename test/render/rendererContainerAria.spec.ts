/**
 * @vitest-environment happy-dom
 *
 * A component hidden on the base device is marked as a duplicate for crawlers, and
 * the mark belongs on the OUTERMOST node of the component: on the width-constraining
 * container when there is one, on the component itself when there is not. The choice
 * is made once and handed to the wrapper; it used to be made twice, in two functions
 * that agreed only by construction, so what is pinned here is that the two nodes do
 * not swap roles and that the mark is never left on both.
 */

// #region Imports
// Types
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';

// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { mount } from '@vue/test-utils';
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

/** Root Grid hidden on the base device, with or without a width container. */
function makeHiddenRoot(fullWidth: boolean): IBricksComponent {
    return {
        id: 'root',
        type: 'layout',
        componentName: 'Grid',
        brickPath: 'layout/grid',
        zIndex: 0,
        props: {},
        children: [],
        deviceVisibility: { desktop: false },
        ...(fullWidth ? { fullWidth: true } : {}),
    };
}

/**
 * Mounts the renderer over a single root component.
 */
function mountRoot(component: IBricksComponent) {
    return mount(TheRenderer, {
        props: { component, componentIndex: buildRendererComponentIndex([component]) },
    });
}

describe('TheRenderer: where aria-hidden lands on a component hidden on the base device', () => {
    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        findImportModuleMock.mockClear();
    });

    it('marks the container and not the block inside it', () => {
        const wrapper = mountRoot(makeHiddenRoot(false));
        const container = wrapper.find('.bricks-container');
        const grid = wrapper.find('[data-bricks-layout="grid"]');

        expect(container.attributes('aria-hidden')).toBe('true');
        expect(grid.attributes('aria-hidden')).toBeUndefined();
    });

    it('marks the block itself when a full-width root has no container', () => {
        const wrapper = mountRoot(makeHiddenRoot(true));
        const grid = wrapper.find('[data-bricks-layout="grid"]');

        expect(wrapper.find('.bricks-container').exists()).toBe(false);
        expect(grid.attributes('aria-hidden')).toBe('true');
    });
});
