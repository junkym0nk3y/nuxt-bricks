// Types
import type { TGridLayoutVariant, TGridRowHeight } from '../types/blockProps';
import type { IBlockDefinition, IBlockRenderContext } from '../types/registry';

// Vue
import { h, type VNode } from 'vue';

// Utils
import { convertPxToRem } from '../../common/utils/main';
import { gridPlacementStyle, makeResponsiveVarGroup } from '../utils/responsiveVars';

/**
 * Нормализует вариант Grid.
 *
 * @param value - Любое значение из props.
 * @returns Валидный вариант Grid.
 */
function normalizeGridVariant(value: unknown): TGridLayoutVariant {
    if (value === 'lead-left' || value === 'lead-right' || value === 'default') {
        return value;
    }

    return 'default';
}

/**
 * Возвращает значение `grid-column` для акцентного элемента в Grid.
 *
 * @param variant - Вариант Grid.
 * @param side - Сторона акцентного элемента.
 * @param span - Сколько колонок должен занимать акцент.
 * @returns Значение для `grid-column`.
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
 * Нормализует значение rowHeight для Grid.
 *
 * @param value - Значение из props.
 * @returns Валидное значение rowHeight.
 */
function normalizeGridRowHeight(value: unknown): TGridRowHeight {
    if (value === 'auto' || value === '1fr' || value === 'min-content' || value === 'max-content') {
        return value;
    }

    return 'auto';
}

/**
 * Строит значение для gridTemplateRows.
 *
 * @param rows - Количество строк (минимум 1).
 * @param rowHeight - Режим высоты строк.
 * @param minRowHeight - Минимальная высота строки в rem.
 * @returns CSS-значение для gridTemplateRows.
 */
function buildGridTemplateRows(
    rows: number,
    rowHeight: TGridRowHeight,
    minRowHeight: number
): string {
    const normalizedRows = Math.max(1, rows);

    if (minRowHeight > 0) {
        const minValue = `${minRowHeight}rem`;
        const maxValue = rowHeight === '1fr' ? '1fr' : 'auto';
        return `repeat(${normalizedRows}, minmax(${minValue}, ${maxValue}))`;
    }

    return `repeat(${normalizedRows}, ${rowHeight})`;
}

/**
 * Считает связанную группу CSS-переменных Grid по разрешённым пропсам.
 *
 * Группа считается целиком, а не по одной переменной: `variant` и `columns`
 * вместе задают разброс акцентной ячейки и `auto-flow`, а `rows`/`rowHeight`/
 * `minRowHeight` — шаблон строк. Переопределение одного члена группы без
 * пересчёта остальных дало бы сетку с новым числом колонок и старым lead-span.
 *
 * @param resolved - Пропсы блока, слитые с overrides устройства.
 * @returns Значения переменных группы без префикса и суффикса устройства.
 */
function computeGridVars(resolved: Record<string, unknown>): Record<string, string> {
    const columns = Math.max(1, Number(resolved.columns) || 1);
    const rows = Math.max(1, Number(resolved.rows) || 1);
    const gap = Math.max(0, Number(resolved.gap) || 0);
    const rowHeight = normalizeGridRowHeight(resolved.rowHeight);
    const minRowHeight = Math.max(0, Number(resolved.minRowHeight) || 0);
    const variant = normalizeGridVariant(resolved.variant);
    const accentSpan = Math.max(1, Math.round(columns / 2));

    return {
        columns: String(columns),
        rows: buildGridTemplateRows(rows, rowHeight, minRowHeight),
        'auto-rows': minRowHeight > 0 ? `minmax(${minRowHeight}rem, auto)` : 'auto',
        gap: convertPxToRem(gap),
        'auto-flow': variant === 'default' ? 'row' : 'row dense',
        'lead-left': buildGridLeadColumn(variant, 'left', accentSpan),
        'lead-right': buildGridLeadColumn(variant, 'right', accentSpan),
    };
}

/**
 * Published-рендер Grid.
 *
 * @param ctx - Контекст рендера published-страницы.
 * @returns VNode Grid.
 */
function renderGridPublished(ctx: IBlockRenderContext): VNode {
    const { component, extraClasses, extraAttrs, styles, renderChild, getChildComponents } = ctx;
    const currentProps = component.props as Record<string, unknown>;

    const style: Record<string, string> = {
        display: 'grid',
        gridTemplateColumns:
            'repeat(var(--bricks-grid-columns, var(--bricks-grid-columns-base, 1)), 1fr)',
        gridTemplateRows: 'var(--bricks-grid-rows, var(--bricks-grid-rows-base, auto))',
        gridAutoRows: 'var(--bricks-grid-auto-rows, var(--bricks-grid-auto-rows-base, auto))',
        gap: 'var(--bricks-grid-gap, var(--bricks-grid-gap-base, 0rem))',
        minHeight: '10rem',
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
 * Definition блока Grid: сетка-контейнер с children в default slot.
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
