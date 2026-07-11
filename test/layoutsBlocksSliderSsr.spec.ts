// Types
import type { IBricksComponent } from '../src/runtime/modules/common/types/brick';
import type { ISliderLayoutProps } from '../src/runtime/modules/layouts-blocks/types/blockProps';

// Vue
import { createSSRApp, defineComponent, h } from 'vue';
import { renderToString } from 'vue/server-renderer';

// Vitest
import { describe, expect, it } from 'vitest';

// Components
import BlockSlider from '../src/runtime/modules/layouts-blocks/components/BlockSlider.vue';

/**
 * Серверное поведение Nuxt ClientOnly: на SSR рендерится только слот fallback.
 * Реальный компонент недоступен вне Nuxt-приложения — стаб воспроизводит контракт.
 */
const ClientOnlyServerStub = defineComponent({
    name: 'ClientOnly',
    setup(_, { slots }) {
        return () => slots.fallback?.() ?? null;
    },
});

const BASE_LAYOUT_PROPS: ISliderLayoutProps = {
    spaceBetween: 24,
    slidesPerViewDesktop: 3,
    slidesPerViewTablet: 2,
    slidesPerViewMobile: 1,
    loop: false,
    autoplay: false,
    autoplayDelay: 3000,
    showNavigation: true,
    showPagination: false,
};

/**
 * Создаёт минимальный компонент схемы для слайда.
 */
function makeSlide(id: string, text: string): IBricksComponent {
    return { id, name: 'Text', props: { text } } as unknown as IBricksComponent;
}

/**
 * Рендерит BlockSlider в SSR-строку с серверным стабом ClientOnly.
 */
async function renderSliderToString(overrides: {
    layoutProps?: Partial<ISliderLayoutProps>;
    slides?: IBricksComponent[];
    isEditor?: boolean;
}): Promise<string> {
    const slides = overrides.slides ?? [
        makeSlide('slide-1', 'First slide content'),
        makeSlide('slide-2', 'Second slide content'),
        makeSlide('slide-3', 'Third slide content'),
    ];

    const app = createSSRApp({
        render: () =>
            h(BlockSlider, {
                layoutProps: { ...BASE_LAYOUT_PROPS, ...overrides.layoutProps },
                layoutId: 'slider-1',
                slides,
                renderSlide: (component: IBricksComponent) =>
                    h('p', String((component.props as { text?: string }).text ?? '')),
                isEditor: overrides.isEditor ?? false,
            }),
    });
    app.component('ClientOnly', ClientOnlyServerStub);

    return renderToString(app);
}

describe('BlockSlider SSR fallback', () => {
    it('published: контент всех слайдов присутствует в server-HTML', async () => {
        const html = await renderSliderToString({});

        expect(html).toContain('First slide content');
        expect(html).toContain('Second slide content');
        expect(html).toContain('Third slide content');
    });

    it('published: fallback несёт slidesPerView per-breakpoint и gap в CSS-переменных', async () => {
        const html = await renderSliderToString({});

        expect(html).toContain('--bricks-slider-gap:24px');
        expect(html).toContain('--bricks-slider-spv-mobile:1');
        expect(html).toContain('--bricks-slider-spv-tablet:2');
        expect(html).toContain('--bricks-slider-spv-desktop:3');
    });

    it('published: невалидные slidesPerView нормализуются к минимуму 1', async () => {
        const html = await renderSliderToString({
            layoutProps: {
                slidesPerViewDesktop: 0,
                slidesPerViewTablet: Number.NaN,
                slidesPerViewMobile: -2,
            },
        });

        expect(html).toContain('--bricks-slider-spv-mobile:1');
        expect(html).toContain('--bricks-slider-spv-tablet:1');
        expect(html).toContain('--bricks-slider-spv-desktop:1');
    });

    it('editor: SSR-fallback не рендерится', async () => {
        const html = await renderSliderToString({ isEditor: true });

        expect(html).not.toContain('First slide content');
        expect(html).not.toContain('--bricks-slider-spv-desktop');
    });

    it('published без слайдов: fallback отсутствует', async () => {
        const html = await renderSliderToString({ slides: [] });

        expect(html).not.toContain('--bricks-slider-spv-desktop');
    });
});
