// Types
import type { IBlockDefinition, IBlockRenderContext } from '../types/registry';

// Vue
import { h, type VNode } from 'vue';

// Constants
import { BLOCK_SPACE_DEFAULT_SIZE, BLOCK_SPACE_MIN_SIZE } from '../constants/blockSpace';

// Utils
import { coerceBlockProps } from '../utils/propertyCoercion';
import {
    gridPlacementStyle,
    hasResponsiveValue,
    makeResponsiveVarGroup,
    toRem,
} from '../utils/responsiveVars';
import { normalizeSpaceSize } from '../utils/spaceSize';

/**
 * The properties the variables of the spacer are computed from. The whole group is
 * recomputed for a device that overrides any of them: the direction decides which
 * dimension takes the size AND which border of the divider draws the line, so picking
 * one member apart from the rest would give a horizontal spacer with a horizontal rule
 * across it.
 */
const SPACE_GROUP_KEYS = [
    'size',
    'direction',
    'showDivider',
    'dividerColor',
    'dividerWidth',
    'dividerStyle',
    'dividerMarginX',
] as const;

/**
 * Computes the variables of a spacer and of its divider for one set of props.
 *
 * @param resolved - Block props merged with the overrides of a device.
 * @returns Values of the group, by variable name.
 */
function computeSpaceVars(resolved: Record<string, unknown>): Record<string, string> {
    const size = normalizeSpaceSize(resolved.size);
    const isVertical = resolved.direction === 'vertical' || resolved.direction === 'both';
    const isHorizontal = resolved.direction === 'horizontal' || resolved.direction === 'both';

    const color = String(resolved.dividerColor || 'var(--bricks-base-200)');
    const borderWidth = `${Math.max(1, Number(resolved.dividerWidth) || 1)}px`;
    const lineStyle = String(resolved.dividerStyle || 'solid');
    const line = `${borderWidth} ${lineStyle} ${color}`;

    const marginX = toRem(resolved.dividerMarginX);
    const span = marginX === '0rem' ? '100%' : `calc(100% - ${marginX} * 2)`;

    return {
        // The normalized size stays a variable of its own, and the dimensions point at
        // it: a spacer has ONE size, and the direction only decides which dimension
        // takes it
        size,
        // The dimension the size does not take keeps what the block always had: the
        // class of the published render declares `width: 100%`, and an inline `auto`
        // would beat it — an empty vertical spacer inside a row would then be zero
        // wide and disappear
        width: isHorizontal ? 'var(--bricks-space-size)' : '100%',
        height: isVertical ? 'var(--bricks-space-size)' : 'auto',
        'divider-display': resolved.showDivider ? 'block' : 'none',
        'divider-width': isVertical ? span : '0',
        'divider-height': isVertical ? '0' : span,
        // A rule drawn by a border rather than by a background: a zero-sized element
        // with one border is what keeps the line crisp at any device pixel ratio
        'divider-border-top': isVertical ? line : '0 none',
        'divider-border-left': isVertical ? '0 none' : line,
    };
}

/**
 * Renders the divider line inside a Space.
 *
 * Every property of the line is read out of a variable, and the element itself is
 * rendered whether the divider shows or not: a media query can switch a `display`, it
 * cannot bring a node into the markup. Turning the divider on for Mobile alone would
 * otherwise do nothing on a page whose base device has none.
 *
 * @returns VNode of the divider.
 */
function renderSpaceDivider(): VNode {
    return h('hr', {
        style: {
            border: 'none',
            flexShrink: '0',
            display: 'var(--bricks-space-divider-display)',
            width: 'var(--bricks-space-divider-width)',
            height: 'var(--bricks-space-divider-height)',
            borderTop: 'var(--bricks-space-divider-border-top)',
            borderLeft: 'var(--bricks-space-divider-border-left)',
        },
    });
}

/**
 * Published render of Space: an `h('div')` with the per-device CSS variables and an
 * optional divider.
 *
 * @param ctx - Render context of the published page.
 * @returns VNode of the spacer component.
 */
function renderSpacePublished(ctx: IBlockRenderContext): VNode {
    const { component, definition, extraClasses, extraAttrs, styles } = ctx;
    const currentProps = coerceBlockProps(
        definition.properties,
        component.props as Record<string, unknown>
    );

    const style: Record<string, string> = {
        backgroundColor: 'transparent',
        border: 'none',
        borderRadius: '0',
        width: 'var(--bricks-space-width)',
        height: 'var(--bricks-space-height)',
        ...makeResponsiveVarGroup(
            '--bricks-space',
            currentProps,
            SPACE_GROUP_KEYS,
            computeSpaceVars
        ),
    };

    // A spacer that carries no divider on any device keeps the markup it always had:
    // the node exists to be switched on and off by a device, and there is nothing to
    // switch when no device asks for a line
    const hasDivider = hasResponsiveValue(currentProps, 'showDivider', currentProps.showDivider);

    if (hasDivider) {
        style.display = 'flex';
        style.alignItems = 'flex-end';
        style.justifyContent = 'center';
    }

    Object.assign(style, gridPlacementStyle(component));

    return h(
        'div',
        {
            id: component.htmlId || undefined,
            style,
            class: [styles.bricksSpace, ...extraClasses],
            'data-bricks-layout': 'space',
            ...extraAttrs,
        },
        hasDivider ? [renderSpaceDivider()] : undefined
    );
}

/**
 * Definition of the Space block: a spacer, with no children.
 */
export const blockSpaceDefinition: IBlockDefinition = {
    name: 'Space',
    description: 'bricks.blocks.space.description',
    thumbnail: 'images/layouts/space.svg',
    responsiveMode: 'all',
    responsiveCssVars: {
        prefix: 'space',
        vars: [
            'size',
            'width',
            'height',
            'divider-display',
            'divider-width',
            'divider-height',
            'divider-border-top',
            'divider-border-left',
        ],
    },
    renderPublished: renderSpacePublished,
    properties: [
        {
            name: 'size',
            type: 'number',
            label: 'bricks.blocks.space.props.size.label',
            default: BLOCK_SPACE_DEFAULT_SIZE,
            min: BLOCK_SPACE_MIN_SIZE,
            step: 0.2,
            description: 'bricks.blocks.space.props.size.description',
            responsive: true,
        },
        {
            name: 'direction',
            responsive: true,
            type: 'select',
            label: 'bricks.blocks.space.props.direction.label',
            default: 'vertical',
            description: 'bricks.blocks.space.props.direction.description',
            options: [
                {
                    label: 'bricks.blocks.space.props.direction.options.vertical',
                    value: 'vertical',
                },
                {
                    label: 'bricks.blocks.space.props.direction.options.horizontal',
                    value: 'horizontal',
                },
                { label: 'bricks.blocks.space.props.direction.options.both', value: 'both' },
            ],
        },
        {
            name: 'showDivider',
            responsive: true,
            type: 'boolean',
            label: 'bricks.blocks.space.props.showDivider.label',
            default: false,
            description: 'bricks.blocks.space.props.showDivider.description',
            group: 'bricks.blocks.space.groups.divider',
        },
        {
            name: 'dividerColor',
            responsive: true,
            type: 'color',
            label: 'bricks.blocks.space.props.dividerColor.label',
            default: '',
            description: 'bricks.blocks.space.props.dividerColor.description',
            group: 'bricks.blocks.space.groups.divider',
        },
        {
            name: 'dividerWidth',
            responsive: true,
            type: 'number',
            label: 'bricks.blocks.space.props.dividerWidth.label',
            default: 1,
            min: 1,
            max: 10,
            group: 'bricks.blocks.space.groups.divider',
        },
        {
            name: 'dividerStyle',
            responsive: true,
            type: 'select',
            label: 'bricks.blocks.space.props.dividerStyle.label',
            default: 'solid',
            options: [
                { label: 'bricks.blocks.space.props.dividerStyle.options.solid', value: 'solid' },
                { label: 'bricks.blocks.space.props.dividerStyle.options.dashed', value: 'dashed' },
                { label: 'bricks.blocks.space.props.dividerStyle.options.dotted', value: 'dotted' },
            ],
            group: 'bricks.blocks.space.groups.divider',
        },
        {
            name: 'dividerMarginX',
            type: 'number',
            label: 'bricks.blocks.space.props.dividerMarginX.label',
            default: 0,
            min: 0,
            step: 0.2,
            description: 'bricks.blocks.space.props.dividerMarginX.description',
            group: 'bricks.blocks.space.groups.divider',
            responsive: true,
        },
    ],
};
