// #region Imports
// Types
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';
import type { TRendererLayoutResult } from '../../src/runtime/modules/render/types/render';

// Vue
import { computed, h } from 'vue';

// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Composables
import { useRendererLayouts } from '../../src/runtime/modules/render/composables/useRendererLayouts';
import { MAX_COMPONENT_TREE_DEPTH } from '../../src/runtime/modules/common/utils/bricks/schemaContract';
// #endregion

/**
 * Grid-компонент схемы (registry-имя 'Grid', renderPublished — eager h('div')).
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
 * Собирает композабл с рекурсивным renderChild — как TheRenderer.
 *
 * The harness records a refusal of the guard instead of silently replacing it
 * with a harmless node: otherwise only the termination of the recursion is
 * checked, not that the caller learns of the refusal and of its reason.
 */
function createHarness(components: IBricksComponent[]) {
    const calls = { renderChild: 0 };
    const refusals: string[] = [];
    let renderLayout: (component: IBricksComponent) => TRendererLayoutResult = () => ({
        kind: 'not-layout',
    });

    const api = useRendererLayouts({
        allComponents: computed(() => components),
        styles: {},
        renderChild: (child: IBricksComponent) => {
            calls.renderChild += 1;
            const result = renderLayout(child);

            if (result.kind === 'refused') {
                refusals.push(result.reason);
            }

            return result.kind === 'rendered' ? result.vnode : h('div');
        },
    });

    renderLayout = api.renderLayoutComponent;

    return { api, calls, refusals };
}

describe('useRendererLayouts: защита от циклов и глубины', () => {
    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('двухузловой цикл завершается, а не рекурсирует бесконечно', () => {
        const a = makeGrid('a', ['b'], 'b');
        const b = makeGrid('b', ['a'], 'a');
        const { api, calls, refusals } = createHarness([a, b]);

        const result = api.renderLayoutComponent(a);

        expect(result.kind).toBe('rendered');
        expect(calls.renderChild).toBeLessThanOrEqual(4);
        // The caller has to tell a refusal over a cycle from "this is not a
        // layout": otherwise it travels into the brick resolver and shows the
        // visitor a wrong diagnosis
        expect(refusals).toEqual(['cycle']);
    });

    it('отказ по циклу сообщается в лог с причиной и id компонента', () => {
        const a = makeGrid('a', ['b'], 'b');
        const b = makeGrid('b', ['a'], 'a');
        const { api } = createHarness([a, b]);

        api.renderLayoutComponent(a);

        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('Layout block refused'),
            expect.objectContaining({ reason: 'cycle', componentId: 'a' })
        );

        // A repeated render of the same branch does not duplicate the log
        api.renderLayoutComponent(a);
        expect(console.warn).toHaveBeenCalledTimes(1);
    });

    it('компонент вне реестра — не отказ, а штатный путь диспетчера', () => {
        const brick: IBricksComponent = {
            id: 'ui',
            type: 'component',
            componentName: 'TestBrick',
            brickPath: 'bricks/TestBrick',
            zIndex: 0,
            props: {},
        };
        const { api } = createHarness([brick]);

        expect(api.renderLayoutComponent(brick)).toEqual({ kind: 'not-layout' });
        expect(console.warn).not.toHaveBeenCalled();
    });

    it('цепочка глубже лимита обрезается без исключения', () => {
        const depth = MAX_COMPONENT_TREE_DEPTH + 8;
        const chain: IBricksComponent[] = [];
        for (let i = 0; i < depth; i += 1) {
            chain.push(
                makeGrid(
                    `n${i}`,
                    i < depth - 1 ? [`n${i + 1}`] : [],
                    i > 0 ? `n${i - 1}` : undefined
                )
            );
        }
        const { api, calls, refusals } = createHarness(chain);

        expect(() => api.renderLayoutComponent(chain[0])).not.toThrow();
        expect(calls.renderChild).toBeLessThanOrEqual(MAX_COMPONENT_TREE_DEPTH);
        expect(refusals).toContain('depth');
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('Layout block refused'),
            expect.objectContaining({
                reason: 'depth',
                maxComponentTreeDepth: MAX_COMPONENT_TREE_DEPTH,
            })
        );
    });

    it('обычная вложенность рендерится (guard не ломает валидные деревья)', () => {
        const parent = makeGrid('p', ['c']);
        const child = makeGrid('c', [], 'p');
        const { api, calls, refusals } = createHarness([parent, child]);

        expect(api.renderLayoutComponent(parent).kind).toBe('rendered');
        expect(calls.renderChild).toBe(1);
        expect(refusals).toEqual([]);
        expect(console.warn).not.toHaveBeenCalled();
    });
});
