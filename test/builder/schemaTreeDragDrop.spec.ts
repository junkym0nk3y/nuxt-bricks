/**
 * @vitest-environment happy-dom
 *
 * A nested row of the schema tree used to accept a drop: it made every row
 * draggable, drew the position indicator and emitted the reorder, while the
 * handler above looks the target up among the root components only and left on a
 * nested one without doing anything. The user saw "you can drop it here",
 * released the button and got nothing.
 */

// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Vue
import { ref } from 'vue';
import { mount } from '@vue/test-utils';

// Types
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';
// #endregion

// #region Mocks
vi.mock('../../src/runtime/modules/builder/core/stores/components', () => ({
    useComponentsStore: () => ({
        isComponentSelected: () => false,
        getComponentById: () => undefined,
    }),
}));

vi.mock('../../src/runtime/modules/builder/core/stores/canvas', () => ({
    useCanvasStore: () => ({ devices: [{ key: 'desktop', label: 'Desktop', icon: 'desktop' }] }),
}));

// A real ref and not a plain object: the template unwraps only a ref, and
// `:draggable` would otherwise get the object itself
vi.mock('../../src/runtime/modules/builder/core/composables/useBuilderPermissions', () => ({
    useBuilderPermissions: () => ({ canEdit: ref(true) }),
}));
// #endregion

import BuilderShellSidebarSchemaTreeItem from '../../src/runtime/modules/builder/shell/sidebar/components/BuilderShellSidebarSchemaTreeItem.vue';

/** Schema component of a tree row. */
function makeComponent(id: string): IBricksComponent {
    return {
        id,
        type: 'layout',
        componentName: 'Grid',
        brickPath: 'layout/grid',
        zIndex: 0,
        props: {},
    };
}

/**
 * Mounts one row of the tree at the given depth.
 *
 * @param depth - Nesting level of the row (0 — a root component).
 */
function mountRow(depth: number) {
    return mount(BuilderShellSidebarSchemaTreeItem, {
        props: { component: makeComponent('c1'), depth },
        global: { stubs: { BricksIcon: true } },
    });
}

/**
 * A dragover event with a working preventDefault counter and a dataTransfer of
 * its own: happy-dom builds no DragEvent, and the drop position is decided by the
 * cursor coordinates.
 */
function makeDragEvent(type: string, clientY = 0) {
    const event = new Event(type, { bubbles: true, cancelable: true }) as Event & {
        clientY: number;
        dataTransfer: { dropEffect: string; getData: () => string };
    };

    Object.defineProperty(event, 'clientY', { value: clientY });
    Object.defineProperty(event, 'dataTransfer', {
        value: { dropEffect: 'none', getData: () => 'dragged-id' },
    });

    return event;
}

describe('schema tree: only a root row is a drop target', () => {
    it('a nested row neither accepts the drop nor promises it', async () => {
        const wrapper = mountRow(1);
        const row = wrapper.get('button');

        const dragover = makeDragEvent('dragover');
        row.element.dispatchEvent(dragover);
        await wrapper.vm.$nextTick();

        // Not accepting the event is what makes the browser show the "not allowed"
        // cursor instead of an indicator
        expect(dragover.defaultPrevented).toBe(false);
        expect(wrapper.html()).not.toContain('dropIndicator');

        row.element.dispatchEvent(makeDragEvent('drop'));
        await wrapper.vm.$nextTick();

        expect(wrapper.emitted('reorder')).toBeUndefined();
    });

    it('a nested row stays a drag source: it can be raised to the root level', () => {
        expect(mountRow(1).get('button').attributes('draggable')).toBe('true');
    });

    it('a root row accepts the drop and reports the exact position', async () => {
        const wrapper = mountRow(0);
        const row = wrapper.get('button');

        const dragover = makeDragEvent('dragover', 1000);
        row.element.dispatchEvent(dragover);
        await wrapper.vm.$nextTick();

        expect(dragover.defaultPrevented).toBe(true);

        row.element.dispatchEvent(makeDragEvent('drop', 1000));
        await wrapper.vm.$nextTick();

        expect(wrapper.emitted('reorder')).toEqual([['dragged-id', 'c1', 'after']]);
    });
});
