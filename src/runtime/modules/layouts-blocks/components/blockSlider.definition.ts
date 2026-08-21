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
// Async import: Swiper (~100KB) must not end up in the bundle of every published page —
// it is loaded only where a slider really is present in the schema. The canvas uses the
// eager version out of canvasBlockComponents.ts, which the definitions never touch.
const BlockSlider = defineAsyncComponent(() => import('./BlockSlider.vue'));

/**
 * Published render of Slider: the children go in as the slides/renderSlide props, with
 * isEditor: false.
 *
 * @param ctx - Render context of the published page.
 * @returns Slider VNode.
 */
function renderSliderPublished(ctx: IBlockRenderContext): VNode {
    const { component, definition, extraClasses, extraAttrs, renderChild, getChildComponents } =
        ctx;
    const componentProps = resolvePublishedProps<ISliderLayoutProps>(definition, component.props);
    const childComponents = getChildComponents(component);
    // The variables are computed from the RAW schema props: `resolvePublishedProps`
    // hands back the base values without `responsive`, and the variables are needed
    // per device
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
        // The attribute is what the generated rule that selects the per-device
        // `--bricks-slider-spv` matches on
        'data-bricks-layout': 'slider',
        ...extraAttrs,
    });
}

/**
 * Computes the per-device variables of the slide count.
 *
 * @param props - Raw block props out of the schema.
 * @returns The `--bricks-slider-spv-*` CSS variables.
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
 * Definition of the Slider block: a swiper container; the children arrive through
 * canvasBind (the slides/renderSlide props) rather than the default slot. The
 * captions/captionPosition/showCaptionNavigation defaults become part of the derived
 * defaultProps, which is behaviorally neutral — they repeat what the component itself
 * already falls back to.
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
