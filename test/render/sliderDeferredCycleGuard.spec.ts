// #region Imports
// Types
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';

// Vue
import { computed, h, type VNode } from 'vue';

// Vitest
import { describe, expect, it } from 'vitest';

// Composables
import { useRendererLayouts } from '../../src/runtime/modules/render/composables/useRendererLayouts';
import { MAX_COMPONENT_TREE_DEPTH } from '../../src/runtime/modules/common/utils/bricks/schemaContract';
// #endregion

/**
 * Callback отложенного рендера слайда, который Slider кладёт в props vnode'а.
 */
type TRenderSlide = (child: IBricksComponent) => VNode | null;

/**
 * Slider-компонент схемы (renderPublished откладывает детей через renderSlide).
 */
function makeSlider(id: string, children: string[], parent?: string): IBricksComponent {
    return {
        id,
        type: 'layout',
        componentName: 'Slider',
        brickPath: 'layout/slider',
        zIndex: 0,
        props: {},
        children,
        ...(parent ? { parent } : {}),
    };
}

/**
 * Grid-компонент схемы (renderPublished рендерит детей eager'ом).
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

/**
 * Собирает из vnode-дерева пары slide/renderSlide отложенных Slider-рендеров —
 * то, что BlockSlider.vue вызывает при собственном рендере (SSR fallback).
 */
function collectDeferredSlides(
    node: unknown,
    found: Array<{ slide: IBricksComponent; renderSlide: TRenderSlide }> = []
): Array<{ slide: IBricksComponent; renderSlide: TRenderSlide }> {
    if (!node || typeof node !== 'object') {
        return found;
    }

    if (Array.isArray(node)) {
        node.forEach((child) => collectDeferredSlides(child, found));
        return found;
    }

    const vnode = node as VNode;
    const props = vnode.props as {
        renderSlide?: TRenderSlide;
        slides?: IBricksComponent[];
    } | null;

    if (props && typeof props.renderSlide === 'function' && Array.isArray(props.slides)) {
        props.slides.forEach((slide) => {
            found.push({ slide, renderSlide: props.renderSlide as TRenderSlide });
        });
    }

    collectDeferredSlides(vnode.children, found);

    return found;
}

describe('useRendererLayouts: цикл через отложенный renderSlide слайдера (аудит A-02)', () => {
    it('цикл Slider A -> Grid B -> Slider A обрывается при deferred-вызове renderSlide', () => {
        const sliderA = makeSlider('a', ['b'], 'b');
        const gridB = makeGrid('b', ['a'], 'a');
        const { api, calls } = createHarness([sliderA, gridB]);

        const root = api.renderLayoutComponent(sliderA);
        expect(root).not.toBe(null);

        // Имитируем то, что делает BlockSlider.vue после выхода из
        // renderPublished: последовательно дёргаем renderSlide каждого
        // обнаруженного вложенного слайдера. Без persistent-цепочки предков
        // обход не завершается (каждый проход порождает новый Slider A).
        const iterationCap = 100;
        let pending = collectDeferredSlides(root);
        let iterations = 0;

        while (pending.length > 0 && iterations < iterationCap) {
            iterations += 1;
            const next: VNode[] = [];
            pending.forEach(({ slide, renderSlide }) => {
                const rendered = renderSlide(slide);
                if (rendered) {
                    next.push(rendered);
                }
            });
            pending = collectDeferredSlides(next);
        }

        expect(iterations).toBeLessThan(iterationCap);
        expect(iterations).toBeLessThanOrEqual(MAX_COMPONENT_TREE_DEPTH);
        expect(calls.renderChild).toBeLessThanOrEqual(MAX_COMPONENT_TREE_DEPTH * 2);
    });

    it('валидный слайдер рендерит слайды через deferred renderSlide без обрезания', () => {
        const slider = makeSlider('s', ['g']);
        const grid = makeGrid('g', [], 's');
        const { api } = createHarness([slider, grid]);

        const root = api.renderLayoutComponent(slider);
        expect(root).not.toBe(null);

        const deferred = collectDeferredSlides(root);
        expect(deferred).toHaveLength(1);

        const rendered = deferred[0].renderSlide(deferred[0].slide);
        expect(rendered).not.toBe(null);
    });
});
