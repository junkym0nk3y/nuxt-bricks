// Types
import type { IBlockSvgProps } from '../types/blockProps';
import type { IBlockDefinition, IBlockRenderContext } from '../types/registry';

// Vue
import { h, defineAsyncComponent, type VNode } from 'vue';

// Utils
import { bindBoundPropsWithComponentId } from '../utils/canvasBindings';
import { coerceBlockProps } from '../utils/propertyCoercion';
import {
    gridPlacementStyle,
    hasResponsiveValue,
    makeResponsiveVars,
    toRem,
} from '../utils/responsiveVars';

// Components
// Async import (the blockSlider pattern): a static import would drag the sanitizer (xss)
// into the entry bundle of every page of the consumer. The canvas uses the eager version
// out of canvasBlockComponents.ts.
const BlockSvg = defineAsyncComponent(() => import('./BlockSvg.vue'));

/**
 * The `justify-content` an alignment of the block stands for. The mapping happens
 * before the value reaches the variable: the property speaks of `left`/`right`, the box
 * model of `flex-start`/`flex-end`.
 *
 * @param value - Value of the alignment property.
 * @returns CSS value of `justify-content`.
 */
function toJustify(value: unknown): string {
    const alignMap: Record<string, string> = {
        left: 'flex-start',
        center: 'center',
        right: 'flex-end',
    };

    return alignMap[String(value)] || 'flex-start';
}

/**
 * Published render of Svg: the component inside a CSS-var wrapper (per-device sizes).
 *
 * @param ctx - Render context of the published page.
 * @returns VNode of the SVG block.
 */
function renderSvgPublished(ctx: IBlockRenderContext): VNode {
    const { component, definition, extraClasses, extraAttrs, styles } = ctx;
    // Both surfaces used to read the raw schema here — the canvas binds `boundProps`,
    // which the builder copies out of the props untouched — so neither consulted the
    // descriptor. A `marginTop` of Infinity became `Infinityrem` in the editor and on
    // the page alike; the fold brings both back to the declared bounds.
    const props = coerceBlockProps(
        definition.properties,
        component.props as Record<string, unknown>
    );
    const cp = props as IBlockSvgProps;

    const style: Record<string, string> = {
        ...makeResponsiveVars('--bricks-media-width', cp.width || '4.8rem', props, 'width'),
        ...makeResponsiveVars('--bricks-media-height', cp.height || '4.8rem', props, 'height'),
        // An SVG has no rounding on any device: the prefix is shared with Media, and
        // without a base value the block would inherit the radius of a picture
        '--bricks-media-radius-base': '0',
        ...makeResponsiveVars('--bricks-svg-justify', cp.alignment, props, 'alignment', toJustify),
    };

    // The margins reach the component as the variable itself rather than as a number:
    // a margin nobody set stays undeclared, and the block keeps letting a stylesheet of
    // the consumer place it
    const hasMarginTop = hasResponsiveValue(props, 'marginTop', cp.marginTop);
    const hasMarginBottom = hasResponsiveValue(props, 'marginBottom', cp.marginBottom);

    if (hasMarginTop) {
        Object.assign(
            style,
            makeResponsiveVars('--bricks-svg-mt', cp.marginTop, props, 'marginTop', toRem)
        );
    }

    if (hasMarginBottom) {
        Object.assign(
            style,
            makeResponsiveVars('--bricks-svg-mb', cp.marginBottom, props, 'marginBottom', toRem)
        );
    }

    Object.assign(style, gridPlacementStyle(component));

    return h(BlockSvg, {
        ...cp,
        width: 'var(--bricks-media-width)',
        height: 'var(--bricks-media-height)',
        marginTop: hasMarginTop ? 'var(--bricks-svg-mt)' : 0,
        marginBottom: hasMarginBottom ? 'var(--bricks-svg-mb)' : 0,
        key: component.id,
        id: component.htmlId || undefined,
        class: [styles.bricksSvg, ...extraClasses],
        style,
        'data-bricks-layout': 'svg',
        ...extraAttrs,
    });
}

/**
 * Definition of the Svg block: an inline SVG with recoloring.
 * svgContent is filled in through svgContentProperty when a file is chosen from the
 * gallery, hence its place in extraDefaults.
 */
export const blockSvgDefinition: IBlockDefinition = {
    name: 'Svg',
    description: 'bricks.blocks.svg.description',
    thumbnail: 'images/layouts/svg.svg',
    responsiveMode: 'all',
    // Svg shares the media variables (--bricks-media-*) with Media — both have the same
    // wrapper
    // Two groups: the sizes share the variables of Media (the size of an inline SVG is
    // the size of a picture), while the alignment and the margins are the block's own —
    // a `justify` under the media prefix would mean nothing on a picture
    responsiveCssVars: [
        {
            prefix: 'media',
            vars: ['width', 'height', 'radius'],
        },
        {
            prefix: 'svg',
            vars: ['justify', 'mt', 'mb'],
        },
    ],
    // The sizes, the alignment and the margins arrive already resolved for the sheet
    // being drawn — the dispatcher overlays every adaptive property onto `boundProps` —
    // so the binding adds nothing but the prompt of the empty state
    canvasBind: (ctx) => ({
        ...bindBoundPropsWithComponentId(ctx),
        emptyLabel: ctx.t('bricks.blocks.svg.emptyLabel'),
    }),
    renderPublished: renderSvgPublished,
    extraDefaults: {
        svgContent: '',
    },
    properties: [
        {
            name: 'src',
            type: 'image',
            label: 'bricks.blocks.svg.props.src.label',
            default: '',
            description: 'bricks.blocks.svg.props.src.description',
            svgContentProperty: 'svgContent',
        },
        {
            name: 'color',
            type: 'color',
            label: 'bricks.blocks.svg.props.color.label',
            default: '',
            description: 'bricks.blocks.svg.props.color.description',
        },
        {
            name: 'width',
            responsive: true,
            type: 'input',
            label: 'bricks.blocks.svg.props.width.label',
            default: '4.8rem',
            unit: 'rem',
            description: 'bricks.blocks.svg.props.width.description',
        },
        {
            name: 'height',
            responsive: true,
            type: 'input',
            label: 'bricks.blocks.svg.props.height.label',
            default: '4.8rem',
            unit: 'rem',
            description: 'bricks.blocks.svg.props.height.description',
        },
        {
            name: 'alignment',
            responsive: true,
            type: 'select',
            label: 'bricks.blocks.svg.props.alignment.label',
            default: 'left',
            options: [
                { label: 'bricks.blocks.svg.props.alignment.options.left', value: 'left' },
                { label: 'bricks.blocks.svg.props.alignment.options.center', value: 'center' },
                { label: 'bricks.blocks.svg.props.alignment.options.right', value: 'right' },
            ],
        },
        {
            name: 'marginTop',
            responsive: true,
            type: 'number',
            label: 'bricks.blocks.svg.props.marginTop.label',
            default: 0,
            min: 0,
            step: 0.2,
            unit: 'rem',
            group: 'bricks.blocks.svg.groups.spacing',
        },
        {
            name: 'marginBottom',
            responsive: true,
            type: 'number',
            label: 'bricks.blocks.svg.props.marginBottom.label',
            default: 0,
            min: 0,
            step: 0.2,
            unit: 'rem',
            group: 'bricks.blocks.svg.groups.spacing',
        },
    ],
};
