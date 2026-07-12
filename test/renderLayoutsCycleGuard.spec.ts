// #region Imports
// Types
import type { IBricksComponent } from '../src/runtime/modules/common/types/brick';

// Vue
import { computed, h, type VNode } from 'vue';

// Vitest
import { describe, expect, it } from 'vitest';

// Composables
import { useRendererLayouts } from '../src/runtime/modules/render/composables/useRendererLayouts';
import { MAX_COMPONENT_TREE_DEPTH } from '../src/runtime/modules/common/utils/bricks/schemaContract';
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
 */
function createHarness(components: IBricksComponent[]) {
    const calls = { renderChild: 0 };
    let renderLayout: (component: IBricksComponent) => VNode | null = () => null;

    const api = useRendererLayouts({
        allComponents: computed(() => components),
        styles: {},
        renderChild: (child: IBricksComponent) => {
            calls.renderChild += 1;
            return renderLayout(child) ?? h('div');
        },
    });

    renderLayout = api.renderLayoutComponent;

    return { api, calls };
}

describe('useRendererLayouts: защита от циклов и глубины (аудит A-02)', () => {
    it('двухузловой цикл завершается, а не рекурсирует бесконечно', () => {
        const a = makeGrid('a', ['b'], 'b');
        const b = makeGrid('b', ['a'], 'a');
        const { api, calls } = createHarness([a, b]);

        const vnode = api.renderLayoutComponent(a);

        expect(vnode).not.toBe(null);
        expect(calls.renderChild).toBeLessThanOrEqual(4);
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
        const { api, calls } = createHarness(chain);

        expect(() => api.renderLayoutComponent(chain[0])).not.toThrow();
        expect(calls.renderChild).toBeLessThanOrEqual(MAX_COMPONENT_TREE_DEPTH);
    });

    it('обычная вложенность рендерится (guard не ломает валидные деревья)', () => {
        const parent = makeGrid('p', ['c']);
        const child = makeGrid('c', [], 'p');
        const { api, calls } = createHarness([parent, child]);

        expect(api.renderLayoutComponent(parent)).not.toBe(null);
        expect(calls.renderChild).toBe(1);
    });
});
