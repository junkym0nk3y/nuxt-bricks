// Types
import type { TGridLayoutVariant, TGridRowHeight } from '../types/blockProps';
import type { IBlockDefinition, IBlockRenderContext } from '../types/registry';

// Vue
import { h, type VNode } from 'vue';

// Constants
import { BLOCK_GRID_MIN_HEIGHT } from '../constants/blockGrid';

// Utils
import { convertPxToRem } from '../../common/utils/main';
import { normalizeGridTrackCount } from '../utils/gridTracks';
import { coerceBlockProps } from '../utils/propertyCoercion';
import { gridPlacementStyle, makeResponsiveVarGroup } from '../utils/responsiveVars';

/**
 * Normalizes the Grid variant.
 *
 * @param value - Any value out of props.
 * @returns A valid Grid variant.
 */
function normalizeGridVariant(value: unknown): TGridLayoutVariant {
    if (value === 'lead-left' || value === 'lead-right' || value === 'default') {
        return value;
    }

    return 'default';
}

/**
 * Returns the `grid-column` value for the accent item of a Grid.
 *
 * @param variant - Grid variant.
 * @param side - Side the accent item sits on.
 * @param span - How many columns the accent has to take.
 * @returns Value for `grid-column`.
 */
function buildGridLeadColumn(
    variant: TGridLayoutVariant,
    side: 'left' | 'right',
    span: number
): string {
    const normalizedSpan = Math.max(1, Math.round(span));

    if (variant === 'lead-left' && side === 'left') {
        return `span ${normalizedSpan}`;
    }

    if (variant === 'lead-right' && side === 'right') {
        return `span ${normalizedSpan}`;
    }

    return 'auto';
}

/**
 * Normalizes the rowHeight value of a Grid.
 *
 * @param value - Value out of props.
 * @returns A valid rowHeight value.
 */
function normalizeGridRowHeight(value: unknown): TGridRowHeight {
    if (value === 'auto' || value === '1fr' || value === 'min-content' || value === 'max-content') {
        return value;
    }

    return 'auto';
}

/**
 * Builds the gridTemplateRows value of a published page.
 *
 * Named for its surface, and deliberately not shared with the canvas counterpart
 * (`canvasGridTemplateRows` in BlockGrid.vue): the canvas gives its unfilled rows a
 * height floor so that the declared structure stays visible to the editor, and a
 * published page must not gain that floor by way of a shared mode flag.
 *
 * @param rows - Declared number of rows.
 * @param rowHeight - Row height mode.
 * @param minRowHeight - Minimum row height in rem.
 * @returns CSS value for gridTemplateRows.
 */
function buildPublishedGridTemplateRows(
    rows: number,
    rowHeight: TGridRowHeight,
    minRowHeight: number
): string {
    if (minRowHeight > 0) {
        const minValue = `${minRowHeight}rem`;
        const maxValue = rowHeight === '1fr' ? '1fr' : 'auto';
        return `repeat(${rows}, minmax(${minValue}, ${maxValue}))`;
    }

    return `repeat(${rows}, ${rowHeight})`;
}

/**
 * Computes the related group of Grid CSS variables from the resolved props.
 *
 * The group is computed as a whole rather than one variable at a time: `variant` and
 * `columns` together set the span of the accent cell and `auto-flow`, while `rows`,
 * `rowHeight` and `minRowHeight` set the row template. Overriding one member of the
 * group without recomputing the rest would give a grid with the new number of columns
 * and the old lead span.
 *
 * @param resolved - Block props merged with the device overrides.
 * @returns Values of the group variables, without the prefix and the device suffix.
 */
function computeGridVars(resolved: Record<string, unknown>): Record<string, string> {
    const columns = normalizeGridTrackCount(Number(resolved.columns));
    const rows = normalizeGridTrackCount(Number(resolved.rows));
    const gap = Math.max(0, Number(resolved.gap) || 0);
    const rowHeight = normalizeGridRowHeight(resolved.rowHeight);
    const minRowHeight = Math.max(0, Number(resolved.minRowHeight) || 0);
    const variant = normalizeGridVariant(resolved.variant);
    const accentSpan = Math.max(1, Math.round(columns / 2));

    return {
        columns: String(columns),
        rows: buildPublishedGridTemplateRows(rows, rowHeight, minRowHeight),
        'auto-rows': minRowHeight > 0 ? `minmax(${minRowHeight}rem, auto)` : 'auto',
        gap: convertPxToRem(gap),
        'auto-flow': variant === 'default' ? 'row' : 'row dense',
        'lead-left': buildGridLeadColumn(variant, 'left', accentSpan),
        'lead-right': buildGridLeadColumn(variant, 'right', accentSpan),
    };
}

/**
 * Published render of a Grid.
 *
 * @param ctx - Render context of the published page.
 * @returns Grid VNode.
 */
function renderGridPublished(ctx: IBlockRenderContext): VNode {
    const { component, definition, extraClasses, extraAttrs, styles, renderChild } = ctx;
    const { getChildComponents } = ctx;
    // The canvas gets its props through the registry, which coerces them against the
    // property definitions; the published render reads the raw schema. Coercing here is
    // what keeps a broken `columns` from becoming `repeat(Infinity, 1fr)` on the page
    // while the editor quietly shows the default.
    const currentProps = coerceBlockProps(
        definition.properties,
        component.props as Record<string, unknown>
    );

    const style: Record<string, string> = {
        display: 'grid',
        gridTemplateColumns:
            'repeat(var(--bricks-grid-columns, var(--bricks-grid-columns-base, 1)), 1fr)',
        gridTemplateRows: 'var(--bricks-grid-rows, var(--bricks-grid-rows-base, auto))',
        gridAutoRows: 'var(--bricks-grid-auto-rows, var(--bricks-grid-auto-rows-base, auto))',
        gap: 'var(--bricks-grid-gap, var(--bricks-grid-gap-base, 0rem))',
        minHeight: BLOCK_GRID_MIN_HEIGHT,
        backgroundColor: 'transparent',
        border: 'none',
        borderRadius: '0',
        gridAutoFlow: 'var(--bricks-grid-auto-flow, var(--bricks-grid-auto-flow-base, row))',
        alignItems: 'stretch',
        ...makeResponsiveVarGroup('--bricks-grid', currentProps, computeGridVars),
    };

    const basePaddingX = Math.round(Math.max(0, Number(currentProps.paddingX) || 0) * 10) / 10;
    const basePaddingY = Math.round(Math.max(0, Number(currentProps.paddingY) || 0) * 10) / 10;

    if (basePaddingX > 0 || basePaddingY > 0) {
        style.padding = `${basePaddingY}rem ${basePaddingX}rem`;
    }

    Object.assign(style, gridPlacementStyle(component));

    const childComponents = getChildComponents(component);

    return h(
        'div',
        {
            id: component.htmlId || undefined,
            style,
            class: [styles.bricksGrid, ...extraClasses],
            'data-bricks-layout': 'grid',
            ...extraAttrs,
        },
        childComponents.map((child) => renderChild(child))
    );
}

/**
 * Definition of the Grid block: a grid container with its children in the default
 * slot.
 */
export const blockGridDefinition: IBlockDefinition = {
    name: 'Grid',
    description: 'bricks.blocks.grid.description',
    thumbnail: 'images/layouts/grid.svg',
    hasChildren: true,
    responsiveMode: 'all',
    responsiveCssVars: {
        prefix: 'grid',
        vars: ['columns', 'rows', 'auto-rows', 'gap', 'auto-flow', 'lead-left', 'lead-right'],
    },
    renderPublished: renderGridPublished,
    properties: [
        {
            name: 'columns',
            type: 'number',
            label: 'bricks.blocks.grid.props.columns.label',
            default: 4,
            min: 1,
            description: 'bricks.blocks.grid.props.columns.description',
        },
        {
            name: 'rows',
            type: 'number',
            label: 'bricks.blocks.grid.props.rows.label',
            default: 1,
            min: 1,
            description: 'bricks.blocks.grid.props.rows.description',
        },
        {
            name: 'gap',
            type: 'number',
            label: 'bricks.blocks.grid.props.gap.label',
            default: 24,
            min: 0,
            description: 'bricks.blocks.grid.props.gap.description',
        },
        {
            name: 'variant',
            type: 'select',
            label: 'bricks.blocks.grid.props.variant.label',
            default: 'default',
            description: 'bricks.blocks.grid.props.variant.description',
            options: [
                { label: 'bricks.blocks.grid.props.variant.options.default', value: 'default' },
                { label: 'bricks.blocks.grid.props.variant.options.leadLeft', value: 'lead-left' },
                {
                    label: 'bricks.blocks.grid.props.variant.options.leadRight',
                    value: 'lead-right',
                },
            ],
        },
        {
            name: 'rowHeight',
            type: 'select',
            label: 'bricks.blocks.grid.props.rowHeight.label',
            default: 'auto',
            description: 'bricks.blocks.grid.props.rowHeight.description',
            options: [
                { label: 'bricks.blocks.grid.props.rowHeight.options.auto', value: 'auto' },
                { label: 'bricks.blocks.grid.props.rowHeight.options.fr1', value: '1fr' },
                {
                    label: 'bricks.blocks.grid.props.rowHeight.options.minContent',
                    value: 'min-content',
                },
                {
                    label: 'bricks.blocks.grid.props.rowHeight.options.maxContent',
                    value: 'max-content',
                },
            ],
        },
        {
            name: 'minRowHeight',
            type: 'number',
            label: 'bricks.blocks.grid.props.minRowHeight.label',
            default: 0,
            min: 0,
            description: 'bricks.blocks.grid.props.minRowHeight.description',
        },
        {
            name: 'paddingX',
            type: 'number',
            label: 'bricks.blocks.grid.props.paddingX.label',
            default: 0,
            min: 0,
            step: 0.2,
            unit: 'rem',
            group: 'bricks.blocks.grid.groups.spacing',
            description: 'bricks.blocks.grid.props.paddingX.description',
        },
        {
            name: 'paddingY',
            type: 'number',
            label: 'bricks.blocks.grid.props.paddingY.label',
            default: 0,
            min: 0,
            step: 0.2,
            unit: 'rem',
            group: 'bricks.blocks.grid.groups.spacing',
            description: 'bricks.blocks.grid.props.paddingY.description',
        },
    ],
};
