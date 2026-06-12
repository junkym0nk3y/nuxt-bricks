// Types
import type { IBricksComponent } from '../../common/types/brick';
import type { ISliderLayoutProps } from '../types/blockProps';
import type { IBlockDefinition, IBlockRenderContext } from '../types/registry';

// Vue
import { h, type VNode } from 'vue';

// Utils
import { gridPlacementStyle } from '../utils/responsiveVars';

// Components
import BlockSlider from './BlockSlider.vue';

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
    description: 'Слайдер-контейнер (swiper) для прокрутки дочерних элементов.',
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
            label: 'Space Between (px)',
            default: 16,
        },
        {
            name: 'slidesPerViewDesktop',
            type: 'number',
            label: 'Slides per view (desktop)',
            default: 3,
        },
        {
            name: 'slidesPerViewTablet',
            type: 'number',
            label: 'Slides per view (tablet)',
            default: 2,
        },
        {
            name: 'slidesPerViewMobile',
            type: 'number',
            label: 'Slides per view (mobile)',
            default: 1,
        },
        {
            name: 'loop',
            type: 'boolean',
            label: 'Loop slides',
            default: false,
        },
        {
            name: 'autoplay',
            type: 'boolean',
            label: 'Autoplay',
            default: false,
        },
        {
            name: 'autoplayDelay',
            type: 'number',
            label: 'Autoplay Delay (ms)',
            default: 3000,
        },
        {
            name: 'showNavigation',
            type: 'boolean',
            label: 'Show Navigation',
            default: true,
        },
        {
            name: 'showPagination',
            type: 'boolean',
            label: 'Show Pagination',
            default: false,
        },
        {
            name: 'captions',
            type: 'textarea',
            label: 'Caption-табы (JSON)',
            default: '[]',
            description: 'Массив объектов [{text, subtitle?}] для текстовых табов навигации',
        },
        {
            name: 'captionPosition',
            type: 'select',
            label: 'Позиция caption-табов',
            default: 'top',
            options: [
                { label: 'Сверху', value: 'top' },
                { label: 'Снизу', value: 'bottom' },
            ],
        },
        {
            name: 'showCaptionNavigation',
            type: 'boolean',
            label: 'Кликабельные caption-табы',
            default: true,
            description: 'Клик по табу переключает слайд',
        },
    ],
};
