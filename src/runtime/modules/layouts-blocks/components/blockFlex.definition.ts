// Types
import type { IBlockDefinition, IBlockRenderContext } from '../types/registry';

// Vue
import { h, type VNode } from 'vue';

// Utils
import { convertPxToRem } from '../../common/utils/main';
import { mapFlexAlign, mapFlexJustify } from '../utils/flexAlignment';
import { coerceBlockProps } from '../utils/propertyCoercion';
import {
    gridPlacementStyle,
    hasResponsiveValue,
    makeResponsiveVarGroup,
    makeResponsiveVars,
    toRem,
} from '../utils/responsiveVars';

/**
 * The properties the variables of the flex group are derived from. A device whose
 * overrides touch none of them gets no copy of the group.
 */
const FLEX_GROUP_KEYS = ['direction', 'justify', 'wrap', 'gap'] as const;

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
    const { component, definition, extraClasses, extraAttrs, styles, renderChild } = ctx;
    const { getChildComponents } = ctx;
    const currentProps = coerceBlockProps(
        definition.properties,
        component.props as Record<string, unknown>
    );

    const style = {
        display: 'flex',
        flexDirection: 'var(--bricks-flex-direction, var(--bricks-flex-direction-base, row))',
        justifyContent: 'var(--bricks-flex-justify, var(--bricks-flex-justify-base, flex-start))',
        alignItems: 'var(--bricks-flex-align, var(--bricks-flex-align-base, stretch))',
        flexWrap: 'var(--bricks-flex-wrap, var(--bricks-flex-wrap-base, nowrap))',
        gap: 'var(--bricks-flex-gap, var(--bricks-flex-gap-base, 0rem))',
        minHeight: 'auto',
        backgroundColor: 'transparent',
        border: 'none',
        borderRadius: '0',
        ...makeResponsiveVarGroup('--bricks-flex', currentProps, FLEX_GROUP_KEYS, computeFlexVars),
        // `align` stands outside the group on purpose: the group is recomputed whole for
        // a device that overrides any of its members, and nothing here is derived from
        // the alignment
        ...makeResponsiveVars(
            '--bricks-flex-align',
            currentProps.align,
            currentProps,
            'align',
            mapFlexAlign
        ),
    };

    if (
        hasResponsiveValue(currentProps, 'paddingX', currentProps.paddingX) ||
        hasResponsiveValue(currentProps, 'paddingY', currentProps.paddingY)
    ) {
        Object.assign(style as Record<string, string>, {
            padding:
                'var(--bricks-flex-py, var(--bricks-flex-py-base, 0rem)) ' +
                'var(--bricks-flex-px, var(--bricks-flex-px-base, 0rem))',
            ...makeResponsiveVars(
                '--bricks-flex-px',
                currentProps.paddingX,
                currentProps,
                'paddingX',
                toRem
            ),
            ...makeResponsiveVars(
                '--bricks-flex-py',
                currentProps.paddingY,
                currentProps,
                'paddingY',
                toRem
            ),
        });
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
        vars: ['direction', 'justify', 'wrap', 'gap', 'align', 'px', 'py'],
    },
    renderPublished: renderFlexPublished,
    properties: [
        {
            name: 'direction',
            responsive: true,
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
            responsive: true,
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
            responsive: true,
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
            responsive: true,
            type: 'number',
            label: 'bricks.blocks.flex.props.gap.label',
            default: 24,
            min: 0,
            description: 'bricks.blocks.flex.props.gap.description',
        },
        {
            name: 'wrap',
            responsive: true,
            type: 'boolean',
            label: 'bricks.blocks.flex.props.wrap.label',
            default: false,
            description: 'bricks.blocks.flex.props.wrap.description',
        },
        {
            name: 'paddingX',
            responsive: true,
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
            responsive: true,
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
