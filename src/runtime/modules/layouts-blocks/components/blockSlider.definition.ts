// Types
import type { IBricksComponent } from '../../common/types/brick';
import type { ISliderLayoutProps } from '../types/blockProps';
import type { IBlockDefinition, IBlockRenderContext } from '../types/registry';

// Vue
import { h, defineAsyncComponent, type VNode } from 'vue';

// Utils
import { gridPlacementStyle } from '../utils/responsiveVars';

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
    const { component, extraClasses, extraAttrs, renderChild, getChildComponents } = ctx;
    const componentProps = component.props as ISliderLayoutProps;
    const childComponents = getChildComponents(component);
    const style = gridPlacementStyle(component);

    return h(BlockSlider, {
        layoutProps: componentProps,
        layoutId: component.id,
        slides: childComponents,
        renderSlide: (child: IBricksComponent) => renderChild(child),
        isEditor: false,
        key: component.id,
        id: component.htmlId || undefined,
        class: extraClasses,
        style: Object.keys(style).length ? style : undefined,
        ...extraAttrs,
    });
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
    thumbnail: '/images/layouts/slider.svg',
    responsiveMode: 'none',
    canvasBind: (ctx) => ({
        layoutProps: ctx.layoutProps,
        layoutId: ctx.component.id,
        slides: ctx.childComponents,
        renderSlide: ctx.renderChild,
        isEditor: true,
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
            name: 'slidesPerViewDesktop',
            type: 'number',
            label: 'bricks.blocks.slider.props.slidesPerViewDesktop.label',
            default: 3,
        },
        {
            name: 'slidesPerViewTablet',
            type: 'number',
            label: 'bricks.blocks.slider.props.slidesPerViewTablet.label',
            default: 2,
        },
        {
            name: 'slidesPerViewMobile',
            type: 'number',
            label: 'bricks.blocks.slider.props.slidesPerViewMobile.label',
            default: 1,
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
