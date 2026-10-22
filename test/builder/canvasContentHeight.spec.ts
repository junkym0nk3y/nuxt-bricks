/**
 * @vitest-environment happy-dom
 *
 * The height of the canvas sheet follows its content, and both surfaces that need it
 * — the store of the normal canvas and a single sheet of Figma mode — go through the
 * same two steps: measure the container, then apply the policy.
 *
 * What is checked here is why each step is written the way it is: the measurement has
 * to drop the `minHeight` that the previous result left behind (otherwise the sheet can
 * only ever grow), the policy has to leave an empty canvas at the height of its device,
 * and the watcher has to notice every move of a block — the store mutates in place, so
 * the reference, the length and even the order of the flat list all stay put on a move
 * into a layout.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { effectScope, nextTick } from 'vue';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Types
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';
// #endregion

vi.mock('nuxt/app', () => ({
    useAppConfig: vi.fn(() => ({})),
}));

// Utils
import {
    measureCanvasContentHeight,
    resolveContentDrivenCanvasHeight,
} from '../../src/runtime/modules/builder/core/utils/canvasHeight';
import { CANVAS_HEIGHT_BUFFER } from '../../src/runtime/modules/builder/core/constants/canvas';

// Composables
import { useCanvasComponentTreeWatch } from '../../src/runtime/modules/builder/canvas/viewport/composables/useCanvasComponentTreeWatch';

// Stores
import { useComponentsStore } from '../../src/runtime/modules/builder/core/stores/components';

/**
 * Builds a container whose reported `scrollHeight` depends on the inline `minHeight`,
 * the way a real container held open by an already computed height behaves.
 *
 * @param contentHeight - Height of the content itself.
 * @returns Element with a scrollHeight getter.
 */
function buildContainer(contentHeight: number): HTMLElement {
    const container = document.createElement('div');

    Object.defineProperty(container, 'scrollHeight', {
        get(): number {
            const minHeight = Number.parseInt(container.style.minHeight, 10);
            return Number.isNaN(minHeight) ? contentHeight : Math.max(minHeight, contentHeight);
        },
    });

    return container;
}

/**
 * Builds a minimal root component of the canvas.
 *
 * @param id - Component id.
 * @param overrides - Fields to override, the links above all.
 * @returns Component for the fixtures.
 */
function buildComponent(id: string, overrides: Partial<IBricksComponent> = {}): IBricksComponent {
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

describe('canvas content measurement', () => {
    it('reads the content past the minHeight the previous result left behind', () => {
        const container = buildContainer(600);
        container.style.minHeight = '1480px';

        expect(measureCanvasContentHeight(container)).toBe(600);
    });

    it('puts the inline minHeight back, so the sheet does not collapse while measured', () => {
        const container = buildContainer(600);
        container.style.minHeight = '1480px';

        measureCanvasContentHeight(container);

        expect(container.style.minHeight).toBe('1480px');
    });

    it('leaves a container with no inline minHeight without one', () => {
        const container = buildContainer(600);

        measureCanvasContentHeight(container);

        expect(container.style.minHeight).toBe('');
    });
});

describe('canvas height policy', () => {
    it('keeps an empty canvas at the sheet height of its device', () => {
        expect(resolveContentDrivenCanvasHeight(1080, 4000, false)).toBe(1080);
    });

    it('holds the base height plus the buffer while the content is shorter', () => {
        expect(resolveContentDrivenCanvasHeight(1080, 200, true)).toBe(1080 + CANVAS_HEIGHT_BUFFER);
    });

    it('follows the content once it outgrows the base height, rounding up', () => {
        expect(resolveContentDrivenCanvasHeight(1080, 2000.2, true)).toBe(
            Math.ceil(2000.2 + CANVAS_HEIGHT_BUFFER)
        );
    });
});

describe('canvas component tree watch', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    /**
     * Mounts the watcher inside a scope and hands back the recompute counter.
     *
     * @returns The components store, the counter and the scope stopper.
     */
    function mountWatch() {
        const componentsStore = useComponentsStore();
        let calls = 0;
        const scope = effectScope();

        scope.run(() => {
            useCanvasComponentTreeWatch(() => {
                calls += 1;
            });
        });

        return { componentsStore, getCalls: () => calls, stop: () => scope.stop() };
    }

    it('notices a component added to the tree', async () => {
        const { componentsStore, getCalls, stop } = mountWatch();

        componentsStore.components.push(buildComponent('a'));
        await nextTick();
        await nextTick();

        expect(getCalls()).toBe(1);
        stop();
    });

    it('notices a whole replacement of the list', async () => {
        const { componentsStore, getCalls, stop } = mountWatch();

        componentsStore.components = [buildComponent('a'), buildComponent('b')];
        await nextTick();
        await nextTick();

        expect(getCalls()).toBe(1);
        stop();
    });

    it('notices a rearrangement, where the reference and the length both stay', async () => {
        const { componentsStore, getCalls, stop } = mountWatch();

        componentsStore.components = [buildComponent('a'), buildComponent('b')];
        await nextTick();
        await nextTick();

        const [first] = componentsStore.components.splice(0, 1);
        componentsStore.components.splice(1, 0, first);
        await nextTick();
        await nextTick();

        expect(getCalls()).toBe(2);
        stop();
    });

    it('notices a block moved into a layout, where the flat list stays as it was', async () => {
        // The production path of a drag onto a Grid: the store rewrites `parent` and the
        // `children` of the two sides, and the flat list keeps its reference, its length
        // and its order — while the root flow the block left may have become shorter
        const { componentsStore, getCalls, stop } = mountWatch();

        componentsStore.components = [
            buildComponent('grid-1', {
                type: 'layout',
                componentName: 'Grid',
                brickPath: 'layout/Grid',
                props: { rows: 4, columns: 4 },
                children: [],
            }),
            buildComponent('block-1'),
        ];
        await nextTick();
        await nextTick();
        const callsBeforeMove = getCalls();
        const listBefore = componentsStore.components;

        componentsStore.moveComponentToLayout('grid-1', 'block-1');
        await nextTick();
        await nextTick();

        expect(componentsStore.components).toBe(listBefore);
        expect(componentsStore.components).toHaveLength(2);
        expect(getCalls()).toBe(callsBeforeMove + 1);
        stop();
    });

    it('notices a child dragged into another cell of the same Grid', async () => {
        // Its place among the children does not change, and the row it leaves may
        // collapse all the same
        const { componentsStore, getCalls, stop } = mountWatch();

        componentsStore.components = [
            buildComponent('grid-1', {
                type: 'layout',
                componentName: 'Grid',
                brickPath: 'layout/Grid',
                props: { rows: 4, columns: 4 },
                children: ['block-1'],
            }),
            buildComponent('block-1', { parent: 'grid-1', gridColumn: '1', gridRow: '1' }),
        ];
        await nextTick();
        await nextTick();
        const callsBeforeMove = getCalls();

        componentsStore.components[1].gridRow = '3';
        await nextTick();
        await nextTick();

        expect(getCalls()).toBe(callsBeforeMove + 1);
        stop();
    });

    it('stays silent when only the props of a component change', async () => {
        const { componentsStore, getCalls, stop } = mountWatch();

        componentsStore.components = [buildComponent('a')];
        await nextTick();
        await nextTick();

        componentsStore.components[0].props.title = 'edited';
        await nextTick();
        await nextTick();

        expect(getCalls()).toBe(1);
        stop();
    });
});
