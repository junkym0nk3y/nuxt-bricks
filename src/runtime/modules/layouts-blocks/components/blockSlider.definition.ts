// Types
import type { IBricksComponent } from '../../common/types/brick';
import type { ISliderLayoutProps } from '../types/blockProps';
import type { IBlockDefinition, IBlockRenderContext } from '../types/registry';

// Vue
import { h, defineAsyncComponent, type VNode } from 'vue';

// Constants
import { DEFAULT_SLIDER_SPACE_BETWEEN, DEFAULT_SLIDES_PER_VIEW } from '../constants/blockSlider';

// Utils
import { normalizeSlidesPerView } from '../utils/slider';
import { coerceBlockProps } from '../utils/propertyCoercion';
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
    // Coercion goes BEFORE the defaults are laid in, and its result feeds BOTH readers:
    // the props of the block and the per-device variables. They used to read
    // `component.props` independently, and the two readers were broken differently. The
    // props disagreed with the canvas, which binds what the registry resolved — a
    // `captionPosition` outside the options reached Swiper while the editor showed the
    // default. The variable table was raw on BOTH surfaces, because the canvas builds it
    // out of the same untouched object, so folding only the published side would have
    // replaced one disagreement with another.
    const coercedProps = coerceBlockProps(
        definition.properties,
        component.props as Record<string, unknown>
    );
    const componentProps = resolvePublishedProps<ISliderLayoutProps>(definition, coercedProps);
    const childComponents = getChildComponents(component);
    const style: Record<string, string> = {
        ...gridPlacementStyle(component),
        ...buildSliderVars(coercedProps),
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
 * The gap between slides as a CSS value.
 *
 * @param value - Value of the property.
 * @returns The gap in pixels, the unit Swiper counts in.
 */
function toSliderGap(value: unknown): string {
    const gap = Number(value);

    // Zero is a legal gap — the property declares no lower bound — and the component
    // folds it by the same rule: a falsy check on one side alone would show one gap in
    // the static markup and another after hydration
    return `${Number.isFinite(gap) && gap >= 0 ? gap : DEFAULT_SLIDER_SPACE_BETWEEN}px`;
}

/**
 * Computes the per-device variables of the slider: the number of slides and the gap
 * between them.
 *
 * @param props - Block props coerced against the property definitions, `responsive`
 *   included: the tables are per device, so the overrides have to survive the fold.
 * @returns The `--bricks-slider-spv-*` and `--bricks-slider-gap-*` CSS variables.
 */
function buildSliderVars(props: Record<string, unknown>): Record<string, string> {
    return {
        ...makeResponsiveVars(
            '--bricks-slider-spv',
            props.slidesPerView ?? DEFAULT_SLIDES_PER_VIEW,
            props,
            'slidesPerView',
            (value) => String(normalizeSlidesPerView(value))
        ),
        // The gap has to travel twice over: this variable lays out the static fallback
        // that goes into the server HTML, and the same value reaches Swiper through its
        // JS breakpoints — after hydration the geometry belongs to the library, and it
        // knows nothing about CSS variables
        ...makeResponsiveVars(
            '--bricks-slider-gap',
            props.spaceBetween,
            props,
            'spaceBetween',
            toSliderGap
        ),
    };
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
        vars: ['spv', 'gap'],
    },
    canvasBind: (ctx, coercedProps) => ({
        layoutProps: ctx.layoutProps,
        layoutId: ctx.component.id,
        slides: ctx.childComponents,
        renderSlide: ctx.renderChild,
        isEditor: true,
        style: buildSliderVars(coercedProps),
        'data-bricks-layout': 'slider',
    }),
    renderPublished: renderSliderPublished,
    properties: [
        {
            name: 'spaceBetween',
            responsive: true,
            type: 'number',
            label: 'bricks.blocks.slider.props.spaceBetween.label',
            default: DEFAULT_SLIDER_SPACE_BETWEEN,
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
        // The json editor, not `textarea`: the latter is the rich-text editor, which wraps
        // whatever is typed into `<p>`, so the JSON never parsed and no tab ever rendered.
        // Not `array` either: an empty default counts as a primitive array there and lands
        // in the comma-separated input
        {
            name: 'captions',
            type: 'object',
            label: 'bricks.blocks.slider.props.captions.label',
            default: [],
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
