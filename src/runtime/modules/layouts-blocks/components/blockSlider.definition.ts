// Types
import type { IBricksComponent } from '../../common/types/brick';
import type { ISliderLayoutProps } from '../types/blockProps';
import type { IBlockDefinition, IBlockRenderContext } from '../types/registry';

// Vue
import { h, defineAsyncComponent, type VNode } from 'vue';

// Constants
import { DEFAULT_SLIDES_PER_VIEW } from '../constants/blockSlider';

// Utils
import { normalizeSlidesPerView } from '../utils/slider';
import { resolvePublishedProps } from '../utils/publishedProps';
import { gridPlacementStyle, makeResponsiveVars } from '../utils/responsiveVars';

// Components
// Async-импорт: Swiper (~100KB) не должен попадать в бандл каждой published-страницы —
// грузится только там, где слайдер реально есть в схеме. Канвас использует
// eager-версию из canvasBlockComponents.ts, definitions она не касается.
const BlockSlider = defineAsyncComponent(() => import('./BlockSlider.vue'));

/**
 * Published-рендер Slider: children идут пропами slides/renderSlide, isEditor: false.
 *
 * @param ctx - Контекст рендера published-страницы.
 * @returns VNode слайдера.
 */
function renderSliderPublished(ctx: IBlockRenderContext): VNode {
    const { component, definition, extraClasses, extraAttrs, renderChild, getChildComponents } =
        ctx;
    const componentProps = resolvePublishedProps<ISliderLayoutProps>(definition, component.props);
    const childComponents = getChildComponents(component);
    // Переменные считаются от СЫРЫХ пропсов схемы: `resolvePublishedProps`
    // отдаёт базовые значения без `responsive`, а переменные нужны per-device
    const style: Record<string, string> = {
        ...gridPlacementStyle(component),
        ...buildSliderVars(component.props as Record<string, unknown>),
    };

    return h(BlockSlider, {
        layoutProps: componentProps,
        layoutId: component.id,
        slides: childComponents,
        renderSlide: (child: IBricksComponent) => renderChild(child),
        isEditor: false,
        key: component.id,
        id: component.htmlId || undefined,
        class: extraClasses,
        style,
        // По атрибуту сматчится сгенерированное правило выбора per-device
        // `--bricks-slider-spv`
        'data-bricks-layout': 'slider',
        ...extraAttrs,
    });
}

/**
 * Считает per-device переменные числа слайдов.
 *
 * @param props - Сырые пропсы блока из схемы.
 * @returns CSS-переменные `--bricks-slider-spv-*`.
 */
function buildSliderVars(props: Record<string, unknown>): Record<string, string> {
    return makeResponsiveVars(
        '--bricks-slider-spv',
        props.slidesPerView ?? DEFAULT_SLIDES_PER_VIEW,
        props,
        'slidesPerView',
        (value) => String(normalizeSlidesPerView(value))
    );
}

/**
 * Definition блока Slider: swiper-контейнер; children идут через canvasBind
 * (пропы slides/renderSlide), а не default slot. Дефолты
 * captions/captionPosition/showCaptionNavigation войдут в derived defaultProps
 * (поведенчески нейтрально — сверка дефолтов, Часть B).
 */
export const blockSliderDefinition: IBlockDefinition = {
    name: 'Slider',
    description: 'bricks.blocks.slider.description',
    thumbnail: 'images/layouts/slider.svg',
    responsiveMode: 'all',
    responsiveCssVars: {
        prefix: 'slider',
        vars: ['spv'],
    },
    canvasBind: (ctx) => ({
        layoutProps: ctx.layoutProps,
        layoutId: ctx.component.id,
        slides: ctx.childComponents,
        renderSlide: ctx.renderChild,
        isEditor: true,
        style: buildSliderVars(ctx.component.props as Record<string, unknown>),
        'data-bricks-layout': 'slider',
    }),
    renderPublished: renderSliderPublished,
    properties: [
        {
            name: 'spaceBetween',
            type: 'number',
            label: 'bricks.blocks.slider.props.spaceBetween.label',
            default: 16,
        },
        {
            name: 'slidesPerView',
            type: 'number',
            label: 'bricks.blocks.slider.props.slidesPerView.label',
            default: DEFAULT_SLIDES_PER_VIEW,
            min: 1,
            step: 1,
            responsive: true,
        },
        {
            name: 'loop',
            type: 'boolean',
            label: 'bricks.blocks.slider.props.loop.label',
            default: false,
        },
        {
            name: 'autoplay',
            type: 'boolean',
            label: 'bricks.blocks.slider.props.autoplay.label',
            default: false,
        },
        {
            name: 'autoplayDelay',
            type: 'number',
            label: 'bricks.blocks.slider.props.autoplayDelay.label',
            default: 3000,
        },
        {
            name: 'showNavigation',
            type: 'boolean',
            label: 'bricks.blocks.slider.props.showNavigation.label',
            default: true,
        },
        {
            name: 'showPagination',
            type: 'boolean',
            label: 'bricks.blocks.slider.props.showPagination.label',
            default: false,
        },
        {
            name: 'captions',
            type: 'textarea',
            label: 'bricks.blocks.slider.props.captions.label',
            default: '[]',
            description: 'bricks.blocks.slider.props.captions.description',
        },
        {
            name: 'captionPosition',
            type: 'select',
            label: 'bricks.blocks.slider.props.captionPosition.label',
            default: 'top',
            options: [
                { label: 'bricks.blocks.slider.props.captionPosition.options.top', value: 'top' },
                {
                    label: 'bricks.blocks.slider.props.captionPosition.options.bottom',
                    value: 'bottom',
                },
            ],
        },
        {
            name: 'showCaptionNavigation',
            type: 'boolean',
            label: 'bricks.blocks.slider.props.showCaptionNavigation.label',
            default: true,
            description: 'bricks.blocks.slider.props.showCaptionNavigation.description',
        },
    ],
};
