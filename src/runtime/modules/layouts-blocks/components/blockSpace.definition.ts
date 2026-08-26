// Types
import type { IBlockDefinition, IBlockRenderContext } from '../types/registry';

// Vue
import { h, type VNode } from 'vue';

// Constants
import { BLOCK_SPACE_DEFAULT_SIZE, BLOCK_SPACE_MIN_SIZE } from '../constants/blockSpace';

// Utils
import { coerceBlockProps } from '../utils/propertyCoercion';
import { gridPlacementStyle, makeResponsiveVars, toRem } from '../utils/responsiveVars';
import { normalizeSpaceSize } from '../utils/spaceSize';

/**
 * Renders the divider line inside a Space.
 *
 * @param spaceProps - Props of the Space component.
 * @param isVertical - Whether the spacing direction is vertical.
 * @returns VNode of the divider.
 */
function renderSpaceDivider(spaceProps: Record<string, unknown>, isVertical: boolean): VNode {
    const color = spaceProps.dividerColor || 'var(--bricks-base-200)';
    const borderWidth = `${Math.max(1, Number(spaceProps.dividerWidth) || 1)}px`;
    const lineStyle = spaceProps.dividerStyle || 'solid';
    const mx = Math.round(Math.max(0, Number(spaceProps.dividerMarginX) || 0) * 10) / 10;

    const hrStyle: Record<string, string> = {
        border: 'none',
        flexShrink: '0',
    };

    if (isVertical) {
        hrStyle.height = '0';
        hrStyle.borderTop = `${borderWidth} ${lineStyle} ${color}`;
        hrStyle.width = mx > 0 ? `calc(100% - ${mx * 2}rem)` : '100%';
    } else {
        hrStyle.width = '0';
        hrStyle.borderLeft = `${borderWidth} ${lineStyle} ${color}`;
        hrStyle.height = mx > 0 ? `calc(100% - ${mx * 2}rem)` : '100%';
    }

    return h('hr', { style: hrStyle });
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
        ...makeResponsiveVars(
            '--bricks-space-size',
            currentProps.size,
            currentProps,
            'size',
            normalizeSpaceSize
        ),
        ...makeResponsiveVars(
            '--bricks-space-divider-mx',
            currentProps.dividerMarginX,
            currentProps,
            'dividerMarginX',
            toRem
        ),
    };

    if (currentProps.direction === 'vertical' || currentProps.direction === 'both') {
        style.height = 'var(--bricks-space-size)';
    }

    if (currentProps.direction === 'horizontal' || currentProps.direction === 'both') {
        style.width = 'var(--bricks-space-size)';
    }

    if (currentProps.showDivider) {
        style.display = 'flex';
        style.alignItems = 'flex-end';
        style.justifyContent = 'center';
    }

    Object.assign(style, gridPlacementStyle(component));

    const isVertical = currentProps.direction === 'vertical' || currentProps.direction === 'both';
    const dividerChildren = currentProps.showDivider
        ? [renderSpaceDivider(currentProps, isVertical)]
        : undefined;

    return h(
        'div',
        {
            id: component.htmlId || undefined,
            style,
            class: [styles.bricksSpace, ...extraClasses],
            'data-bricks-layout': 'space',
            ...extraAttrs,
        },
        dividerChildren
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
        vars: ['size', 'divider-mx'],
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
            type: 'boolean',
            label: 'bricks.blocks.space.props.showDivider.label',
            default: false,
            description: 'bricks.blocks.space.props.showDivider.description',
            group: 'bricks.blocks.space.groups.divider',
        },
        {
            name: 'dividerColor',
            type: 'color',
            label: 'bricks.blocks.space.props.dividerColor.label',
            default: '',
            description: 'bricks.blocks.space.props.dividerColor.description',
            group: 'bricks.blocks.space.groups.divider',
        },
        {
            name: 'dividerWidth',
            type: 'number',
            label: 'bricks.blocks.space.props.dividerWidth.label',
            default: 1,
            min: 1,
            max: 10,
            group: 'bricks.blocks.space.groups.divider',
        },
        {
            name: 'dividerStyle',
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
