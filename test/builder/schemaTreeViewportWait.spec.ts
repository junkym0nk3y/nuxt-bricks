/**
 * @vitest-environment happy-dom
 *
 * Selecting a row of the schema tree scrolls the canvas to the component. When the
 * component is invisible on the current device, the tree first switches the viewport —
 * and the scroll has to wait for that switch to be over, otherwise it aims at a sheet
 * still on the move and lands on the old geometry.
 *
 * The canvas store here is the real one, because the subject is exactly the seam between
 * them: the tree waits for the state the store holds while the sheet moves, not for a
 * duration of its own. A timer chosen to outlast the transition races it — and the two
 * numbers drift apart silently.
 */

// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { defineComponent, h, nextTick } from 'vue';
import { mount } from '@vue/test-utils';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Types
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';
import type { TBricksResolvedDeviceSet } from '../../src/runtime/modules/common/types/devices';
// #endregion

// #region Mocks
const { componentsStoreMock, scrollToComponentOnCanvas } = vi.hoisted(() => ({
    componentsStoreMock: {
        components: [] as IBricksComponent[],
        hasComponents: true,
        getRootComponents: () => componentsStoreMock.components,
        getComponentById: (id: string) =>
            componentsStoreMock.components.find((component) => component.id === id),
        selectComponent: vi.fn(),
    },
    scrollToComponentOnCanvas: vi.fn(),
}));

vi.mock('nuxt/app', () => ({
    useAppConfig: vi.fn(() => ({})),
}));

vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key, te: () => true }),
}));

vi.mock('../../src/runtime/modules/builder/core/stores/components', () => ({
    useComponentsStore: () => componentsStoreMock,
}));

vi.mock('../../src/runtime/modules/builder/core/composables/useComponentEditorMetadata', () => ({
    useComponentEditorMetadata: () => ({
        resolveComponentEditorMetadata: () => ({ properties: [], description: '' }),
    }),
}));

vi.mock('../../src/runtime/modules/builder/core/composables/useComponentMoveFeedback', () => ({
    useComponentMoveFeedback: () => ({ reportRefusedMove: vi.fn() }),
}));

vi.mock('../../src/runtime/modules/builder/core/utils/scrollToComponent', () => ({
    scrollToComponentOnCanvas,
}));
// #endregion

import BuilderShellSidebarSchemaTreeView from '../../src/runtime/modules/builder/shell/sidebar/components/BuilderShellSidebarSchemaTreeView.vue';
import { useCanvasStore } from '../../src/runtime/modules/builder/core/stores/canvas';
import { VIEWPORT_SWITCH_SETTLE_MS } from '../../src/runtime/modules/builder/core/constants/canvas';

/** A row of the tree, cut down to the one event the view listens to. */
const TreeItemStub = defineComponent({
    name: 'BuilderShellSidebarSchemaTreeItem',
    props: {
        component: { type: Object, required: true },
        depth: { type: Number, default: 0 },
    },
    emits: ['select', 'move'],
    setup(props, { emit }) {
        return () =>
            h('button', {
                type: 'button',
                onClick: () => emit('select', (props.component as IBricksComponent).id),
            });
    },
});

const DEVICES: TBricksResolvedDeviceSet = [
    {
        key: 'mobile',
        label: 'Mobile',
        icon: 'device-mobile',
        width: 375,
        aside: 0.4,
        remBase: '10px',
        canvasHeight: 812,
    },
    {
        key: 'desktop',
        label: 'Desktop',
        icon: 'device-desktop',
        width: 1600,
        aside: 2,
        remBase: '10px',
        canvasHeight: 1080,
    },
];

/**
 * Builds a root component of the tree.
 *
 * @param overrides - Fields to override, the per-device visibility above all.
 * @returns Component for the fixtures.
 */
function buildComponent(overrides: Partial<IBricksComponent> = {}): IBricksComponent {
    return {
        id: 'hero',
        type: 'layout',
        componentName: 'Section',
        brickPath: 'layout/section',
        zIndex: 0,
        props: {},
        ...overrides,
    };
}

/**
 * Mounts the tree over one row.
 *
 * @returns Wrapper of the view.
 */
function mountTree() {
    return mount(BuilderShellSidebarSchemaTreeView, {
        global: {
            stubs: {
                BuilderShellSidebarSchemaTreeItem: TreeItemStub,
                BricksCloseButton: true,
                BricksEmptyState: true,
                BricksIcon: true,
            },
        },
    });
}

/**
 * Lets the awaited chain of the handler run to its end.
 */
async function flushHandler(): Promise<void> {
    await nextTick();
    await nextTick();
    await nextTick();
}

describe('schema tree: the scroll waits for the viewport switch', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        setActivePinia(createPinia());
        useCanvasStore().setDevices(DEVICES);
        componentsStoreMock.components = [];
        componentsStoreMock.selectComponent.mockClear();
        scrollToComponentOnCanvas.mockClear();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('holds the scroll back while the sheet the tree switched to is still moving', async () => {
        componentsStoreMock.components = [
            buildComponent({ deviceVisibility: { desktop: false, mobile: true } }),
        ];
        const canvasStore = useCanvasStore();
        const wrapper = mountTree();

        await wrapper.find('button').trigger('click');
        await flushHandler();

        expect(canvasStore.viewport).toBe('mobile');
        expect(canvasStore.isViewportSwitching).toBe(true);
        expect(scrollToComponentOnCanvas).not.toHaveBeenCalled();

        vi.advanceTimersByTime(VIEWPORT_SWITCH_SETTLE_MS);
        await flushHandler();

        expect(scrollToComponentOnCanvas).toHaveBeenCalledTimes(1);
        expect(scrollToComponentOnCanvas).toHaveBeenCalledWith('hero', undefined);
    });

    it('waits out a switch started elsewhere, not only its own', async () => {
        // The bottom bar switched the viewport, and the row clicked next is visible
        // everywhere: there is nothing for the tree itself to switch, and the sheet is
        // moving all the same
        componentsStoreMock.components = [buildComponent()];
        const canvasStore = useCanvasStore();
        canvasStore.setViewport('mobile');
        const wrapper = mountTree();

        await wrapper.find('button').trigger('click');
        await flushHandler();

        expect(scrollToComponentOnCanvas).not.toHaveBeenCalled();

        vi.advanceTimersByTime(VIEWPORT_SWITCH_SETTLE_MS);
        await flushHandler();

        expect(scrollToComponentOnCanvas).toHaveBeenCalledTimes(1);
    });

    it('scrolls right away when nothing is switching', async () => {
        componentsStoreMock.components = [buildComponent()];
        const wrapper = mountTree();

        await wrapper.find('button').trigger('click');
        await flushHandler();

        expect(scrollToComponentOnCanvas).toHaveBeenCalledTimes(1);
    });

    it('selects the component and opens the panel without waiting for the sheet', async () => {
        componentsStoreMock.components = [
            buildComponent({ deviceVisibility: { desktop: false, mobile: true } }),
        ];
        const wrapper = mountTree();

        await wrapper.find('button').trigger('click');

        expect(componentsStoreMock.selectComponent).toHaveBeenCalledTimes(1);
        expect(useCanvasStore().isViewportSwitching).toBe(true);
    });
});
