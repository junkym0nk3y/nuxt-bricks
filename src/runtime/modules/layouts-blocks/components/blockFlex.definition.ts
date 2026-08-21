// Types
import type { IBlockDefinition, IBlockRenderContext } from '../types/registry';

// Vue
import { h, type VNode } from 'vue';

// Utils
import { convertPxToRem } from '../../common/utils/main';
import { gridPlacementStyle, makeResponsiveVarGroup } from '../utils/responsiveVars';

const FLEX_JUSTIFY_CSS: Record<string, string> = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    'space-between': 'space-between',
    'space-around': 'space-around',
};

const FLEX_ALIGN_CSS: Record<string, string> = {
    stretch: 'stretch',
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    baseline: 'baseline',
};

/**
 * Maps a justify value ('start', 'center', 'end', 'space-between', 'space-around') onto
 * the CSS flex justify-content.
 *
 * @param justify - Alignment value out of props (the schema does not guarantee the type).
 * @returns CSS value for justify-content.
 */
function mapFlexJustify(justify?: unknown): string {
    return FLEX_JUSTIFY_CSS[String(justify)] ?? 'flex-start';
}

/**
 * Maps an align value ('stretch', 'start', 'center', 'end', 'baseline') onto the CSS
 * flex align-items.
 *
 * @param align - Alignment value out of props (the schema does not guarantee the type).
 * @returns CSS value for align-items.
 */
function mapFlexAlign(align?: unknown): string {
    return FLEX_ALIGN_CSS[String(align)] ?? 'stretch';
}

/**
 * Computes the group of Flex CSS variables from the resolved props.
 *
 * As a group rather than one variable at a time: in Flex the members are not derived
 * from one another, but a shared computation keeps the variable emission of every block
 * in one shape and removes the question of whether a given variable really was computed
 * from the same overrides.
 *
 * @param resolved - Block props merged with the device overrides.
 * @returns Values of the group variables, without the prefix and the device suffix.
 */
function computeFlexVars(resolved: Record<string, unknown>): Record<string, string> {
    return {
        direction: String(resolved.direction || 'row'),
        justify: mapFlexJustify(resolved.justify),
        wrap: resolved.wrap ? 'wrap' : 'nowrap',
        gap: convertPxToRem(Math.max(0, Number(resolved.gap ?? 24) || 0)),
    };
}

/**
 * Published render of Flex: an `h('div')` with the per-device CSS variables (the canvas
 * BlockFlex carries the editor chrome and is not used on a published page).
 *
 * @param ctx - Render context of the published page.
 * @returns VNode of the flex component.
 */
function renderFlexPublished(ctx: IBlockRenderContext): VNode {
    const { component, extraClasses, extraAttrs, styles, renderChild, getChildComponents } = ctx;
    const currentProps = component.props as Record<string, unknown>;

    const style = {
        display: 'flex',
        flexDirection: 'var(--bricks-flex-direction, var(--bricks-flex-direction-base, row))',
        justifyContent: 'var(--bricks-flex-justify, var(--bricks-flex-justify-base, flex-start))',
        alignItems: mapFlexAlign(currentProps.align),
        flexWrap: 'var(--bricks-flex-wrap, var(--bricks-flex-wrap-base, nowrap))',
        gap: 'var(--bricks-flex-gap, var(--bricks-flex-gap-base, 0rem))',
        minHeight: 'auto',
        backgroundColor: 'transparent',
        border: 'none',
        borderRadius: '0',
        ...makeResponsiveVarGroup('--bricks-flex', currentProps, computeFlexVars),
    };

    const basePaddingX = Math.round(Math.max(0, Number(currentProps.paddingX) || 0) * 10) / 10;
    const basePaddingY = Math.round(Math.max(0, Number(currentProps.paddingY) || 0) * 10) / 10;

    if (basePaddingX > 0 || basePaddingY > 0) {
        (style as Record<string, string>).padding = `${basePaddingY}rem ${basePaddingX}rem`;
    }

    Object.assign(style as Record<string, string>, gridPlacementStyle(component));

    const childComponents = getChildComponents(component);

    return h(
        'div',
        {
            id: component.htmlId || undefined,
            style,
            class: [styles.bricksFlex, ...extraClasses],
            'data-bricks-layout': 'flex',
            ...extraAttrs,
        },
        childComponents.map((child) => renderChild(child))
    );
}

/**
 * Definition of the Flex block: a flex container with its children in the default slot.
 * The `wrap: false` default matches what block creation has always produced.
 */
export const blockFlexDefinition: IBlockDefinition = {
    name: 'Flex',
    description: 'bricks.blocks.flex.description',
    thumbnail: 'images/layouts/flex.svg',
    hasChildren: true,
    responsiveMode: 'all',
    responsiveCssVars: {
        prefix: 'flex',
        vars: ['direction', 'justify', 'wrap', 'gap'],
    },
    renderPublished: renderFlexPublished,
    properties: [
        {
            name: 'direction',
            type: 'select',
            label: 'bricks.blocks.flex.props.direction.label',
            default: 'row',
            description: 'bricks.blocks.flex.props.direction.description',
            options: [
                { label: 'bricks.blocks.flex.props.direction.options.row', value: 'row' },
                { label: 'bricks.blocks.flex.props.direction.options.column', value: 'column' },
            ],
        },
        {
            name: 'justify',
            type: 'select',
            label: 'bricks.blocks.flex.props.justify.label',
            default: 'start',
            description: 'bricks.blocks.flex.props.justify.description',
            options: [
                { label: 'bricks.blocks.flex.props.justify.options.start', value: 'start' },
                { label: 'bricks.blocks.flex.props.justify.options.center', value: 'center' },
                { label: 'bricks.blocks.flex.props.justify.options.end', value: 'end' },
                {
                    label: 'bricks.blocks.flex.props.justify.options.spaceBetween',
                    value: 'space-between',
                },
                {
                    label: 'bricks.blocks.flex.props.justify.options.spaceAround',
                    value: 'space-around',
                },
            ],
        },
        {
            name: 'align',
            type: 'select',
            label: 'bricks.blocks.flex.props.align.label',
            default: 'stretch',
            description: 'bricks.blocks.flex.props.align.description',
            options: [
                { label: 'bricks.blocks.flex.props.align.options.stretch', value: 'stretch' },
                { label: 'bricks.blocks.flex.props.align.options.start', value: 'start' },
                { label: 'bricks.blocks.flex.props.align.options.center', value: 'center' },
                { label: 'bricks.blocks.flex.props.align.options.end', value: 'end' },
                { label: 'bricks.blocks.flex.props.align.options.baseline', value: 'baseline' },
            ],
        },
        {
            name: 'gap',
            type: 'number',
            label: 'bricks.blocks.flex.props.gap.label',
            default: 24,
            min: 0,
            description: 'bricks.blocks.flex.props.gap.description',
        },
        {
            name: 'wrap',
            type: 'boolean',
            label: 'bricks.blocks.flex.props.wrap.label',
            default: false,
            description: 'bricks.blocks.flex.props.wrap.description',
        },
        {
            name: 'paddingX',
            type: 'number',
            label: 'bricks.blocks.flex.props.paddingX.label',
            default: 0,
            min: 0,
            step: 0.2,
            unit: 'rem',
            group: 'bricks.blocks.flex.groups.spacing',
            description: 'bricks.blocks.flex.props.paddingX.description',
        },
        {
            name: 'paddingY',
            type: 'number',
            label: 'bricks.blocks.flex.props.paddingY.label',
            default: 0,
            min: 0,
            step: 0.2,
            unit: 'rem',
            group: 'bricks.blocks.flex.groups.spacing',
            description: 'bricks.blocks.flex.props.paddingY.description',
        },
    ],
};
