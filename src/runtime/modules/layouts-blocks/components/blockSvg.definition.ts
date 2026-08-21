// Types
import type { IBlockSvgProps } from '../types/blockProps';
import type { IBlockDefinition, IBlockRenderContext } from '../types/registry';

// Vue
import { h, defineAsyncComponent, type VNode } from 'vue';

// Utils
import { bindBoundPropsWithComponentId } from '../utils/canvasBindings';
import { gridPlacementStyle, makeResponsiveVars } from '../utils/responsiveVars';

// Components
// Async import (the blockSlider pattern): a static import would drag the sanitizer (xss)
// into the entry bundle of every page of the consumer. The canvas uses the eager version
// out of canvasBlockComponents.ts.
const BlockSvg = defineAsyncComponent(() => import('./BlockSvg.vue'));

/**
 * Published render of Svg: the component inside a CSS-var wrapper (per-device sizes).
 *
 * @param ctx - Render context of the published page.
 * @returns VNode of the SVG block.
 */
function renderSvgPublished(ctx: IBlockRenderContext): VNode {
    const { component, extraClasses, extraAttrs, styles } = ctx;
    const cp = component.props as IBlockSvgProps;
    const props = cp as Record<string, unknown>;

    const style: Record<string, string> = {
        ...makeResponsiveVars('--bricks-media-width', cp.width || '4.8rem', props, 'width'),
        ...makeResponsiveVars('--bricks-media-height', cp.height || '4.8rem', props, 'height'),
        // An SVG has no rounding on any device: the prefix is shared with Media, and
        // without a base value the block would inherit the radius of a picture
        '--bricks-media-radius-base': '0',
    };
    Object.assign(style, gridPlacementStyle(component));

    return h(BlockSvg, {
        ...cp,
        width: 'var(--bricks-media-width)',
        height: 'var(--bricks-media-height)',
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
    responsiveCssVars: {
        prefix: 'media',
        vars: ['width', 'height', 'radius'],
    },
    canvasBind: bindBoundPropsWithComponentId,
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
            type: 'input',
            label: 'bricks.blocks.svg.props.width.label',
            default: '4.8rem',
            unit: 'rem',
            description: 'bricks.blocks.svg.props.width.description',
        },
        {
            name: 'height',
            type: 'input',
            label: 'bricks.blocks.svg.props.height.label',
            default: '4.8rem',
            unit: 'rem',
            description: 'bricks.blocks.svg.props.height.description',
        },
        {
            name: 'alignment',
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
