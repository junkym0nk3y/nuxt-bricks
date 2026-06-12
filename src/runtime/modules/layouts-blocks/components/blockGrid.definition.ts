// Types
import type { TGridLayoutVariant, TGridRowHeight } from '../types/blockProps';
import type { IBlockDefinition, IBlockRenderContext } from '../types/registry';

// Vue
import { h, type VNode } from 'vue';

// Utils
import { convertPxToRem } from '../../common/utils/main';
import {
    getResponsiveOverrides,
    gridPlacementStyle,
    resolveResponsiveValue,
} from '../utils/responsiveVars';

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
 * Published-рендер Grid: `h('div')` с per-device CSS-переменными
 * (канвасный BlockGrid несёт editor chrome и на published не используется).
 *
 * @param ctx - Контекст рендера published-страницы.
 * @returns VNode grid-компонента.
 */
// eslint-disable-next-line complexity
function renderGridPublished(ctx: IBlockRenderContext): VNode {
    const { component, extraClasses, extraAttrs, styles, renderChild, getChildComponents } = ctx;
    const currentProps = component.props as Record<string, any>;
    const baseColumns = Math.max(1, Number(currentProps.columns) || 1);
    const baseRows = Math.max(1, Number(currentProps.rows) || 1);
    const baseGapValue = Math.max(0, Number(currentProps.gap) || 0);
    const baseRowHeight = normalizeGridRowHeight(currentProps.rowHeight);
    const baseMinRowHeight = Math.max(0, Number(currentProps.minRowHeight) || 0);

    const mobileOverrides = getResponsiveOverrides(currentProps, 'mobile');
    const tabletOverrides = getResponsiveOverrides(currentProps, 'tablet');

    const columnsMobile = Math.max(
        1,
        Number(resolveResponsiveValue(baseColumns, mobileOverrides, 'columns')) || baseColumns
    );
    const columnsTablet = Math.max(
        1,
        Number(resolveResponsiveValue(baseColumns, tabletOverrides, 'columns')) || baseColumns
    );
    const columnsDesktop = baseColumns;

    const rowsMobile = Math.max(
        1,
        Number(resolveResponsiveValue(baseRows, mobileOverrides, 'rows')) || baseRows
    );
    const rowsTablet = Math.max(
        1,
        Number(resolveResponsiveValue(baseRows, tabletOverrides, 'rows')) || baseRows
    );
    const rowsDesktop = baseRows;

    const gapMobile = Math.max(
        0,
        Number(resolveResponsiveValue(baseGapValue, mobileOverrides, 'gap')) || baseGapValue
    );
    const gapTablet = Math.max(
        0,
        Number(resolveResponsiveValue(baseGapValue, tabletOverrides, 'gap')) || baseGapValue
    );
    const gapDesktop = baseGapValue;

    const rowHeightMobile = normalizeGridRowHeight(
        resolveResponsiveValue(baseRowHeight, mobileOverrides, 'rowHeight')
    );
    const rowHeightTablet = normalizeGridRowHeight(
        resolveResponsiveValue(baseRowHeight, tabletOverrides, 'rowHeight')
    );
    const rowHeightDesktop = baseRowHeight;

    const minRowHeightMobile = Math.max(
        0,
        Number(resolveResponsiveValue(baseMinRowHeight, mobileOverrides, 'minRowHeight')) ||
            baseMinRowHeight
    );
    const minRowHeightTablet = Math.max(
        0,
        Number(resolveResponsiveValue(baseMinRowHeight, tabletOverrides, 'minRowHeight')) ||
            baseMinRowHeight
    );
    const minRowHeightDesktop = baseMinRowHeight;

    const baseVariant = normalizeGridVariant(currentProps.variant);
    const variantMobile = normalizeGridVariant(
        resolveResponsiveValue(baseVariant, mobileOverrides, 'variant')
    );
    const variantTablet = normalizeGridVariant(
        resolveResponsiveValue(baseVariant, tabletOverrides, 'variant')
    );
    const variantDesktop = baseVariant;

    const accentSpanMobile = Math.max(1, Math.round(columnsMobile / 2));
    const accentSpanTablet = Math.max(1, Math.round(columnsTablet / 2));
    const accentSpanDesktop = Math.max(1, Math.round(columnsDesktop / 2));

    const leadLeftMobile = buildGridLeadColumn(variantMobile, 'left', accentSpanMobile);
    const leadRightMobile = buildGridLeadColumn(variantMobile, 'right', accentSpanMobile);

    const leadLeftTablet = buildGridLeadColumn(variantTablet, 'left', accentSpanTablet);
    const leadRightTablet = buildGridLeadColumn(variantTablet, 'right', accentSpanTablet);

    const leadLeftDesktop = buildGridLeadColumn(variantDesktop, 'left', accentSpanDesktop);
    const leadRightDesktop = buildGridLeadColumn(variantDesktop, 'right', accentSpanDesktop);

    const autoFlowMobile = variantMobile === 'default' ? 'row' : 'row dense';
    const autoFlowTablet = variantTablet === 'default' ? 'row' : 'row dense';
    const autoFlowDesktop = variantDesktop === 'default' ? 'row' : 'row dense';

    // Строим gridTemplateRows для каждого viewport
    const gridRowsMobile = buildGridTemplateRows(rowsMobile, rowHeightMobile, minRowHeightMobile);
    const gridRowsTablet = buildGridTemplateRows(rowsTablet, rowHeightTablet, minRowHeightTablet);
    const gridRowsDesktop = buildGridTemplateRows(
        rowsDesktop,
        rowHeightDesktop,
        minRowHeightDesktop
    );

    // gridAutoRows для новых строк
    const autoRowsMobile =
        minRowHeightMobile > 0 ? `minmax(${minRowHeightMobile}rem, auto)` : 'auto';
    const autoRowsTablet =
        minRowHeightTablet > 0 ? `minmax(${minRowHeightTablet}rem, auto)` : 'auto';
    const autoRowsDesktop =
        minRowHeightDesktop > 0 ? `minmax(${minRowHeightDesktop}rem, auto)` : 'auto';

    const style: Record<string, string> = {
        display: 'grid',
        gridTemplateColumns:
            'repeat(var(--bricks-grid-columns, var(--bricks-grid-columns-desktop, 1)), 1fr)',
        gridTemplateRows: 'var(--bricks-grid-rows, var(--bricks-grid-rows-desktop, auto))',
        gridAutoRows: 'var(--bricks-grid-auto-rows, var(--bricks-grid-auto-rows-desktop, auto))',
        gap: 'var(--bricks-grid-gap, var(--bricks-grid-gap-desktop, 0rem))',
        minHeight: '10rem',
        backgroundColor: 'transparent',
        border: 'none',
        borderRadius: '0',
        gridAutoFlow: 'var(--bricks-grid-auto-flow, var(--bricks-grid-auto-flow-desktop, row))',
        alignItems: 'stretch',
        '--bricks-grid-columns-mobile': String(columnsMobile),
        '--bricks-grid-columns-tablet': String(columnsTablet),
        '--bricks-grid-columns-desktop': String(columnsDesktop),
        '--bricks-grid-rows-mobile': gridRowsMobile,
        '--bricks-grid-rows-tablet': gridRowsTablet,
        '--bricks-grid-rows-desktop': gridRowsDesktop,
        '--bricks-grid-auto-rows-mobile': autoRowsMobile,
        '--bricks-grid-auto-rows-tablet': autoRowsTablet,
        '--bricks-grid-auto-rows-desktop': autoRowsDesktop,
        '--bricks-grid-gap-mobile': convertPxToRem(gapMobile),
        '--bricks-grid-gap-tablet': convertPxToRem(gapTablet),
        '--bricks-grid-gap-desktop': convertPxToRem(gapDesktop),
        '--bricks-grid-auto-flow-mobile': autoFlowMobile,
        '--bricks-grid-auto-flow-tablet': autoFlowTablet,
        '--bricks-grid-auto-flow-desktop': autoFlowDesktop,
        '--bricks-grid-lead-left-mobile': leadLeftMobile,
        '--bricks-grid-lead-right-mobile': leadRightMobile,
        '--bricks-grid-lead-left-tablet': leadLeftTablet,
        '--bricks-grid-lead-right-tablet': leadRightTablet,
        '--bricks-grid-lead-left-desktop': leadLeftDesktop,
        '--bricks-grid-lead-right-desktop': leadRightDesktop,
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
    description: 'Сетка для размещения компонентов по колонкам и строкам.',
    thumbnail: '/images/layouts/grid.svg',
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
            label: 'Колонки',
            default: 4,
            min: 1,
            description: 'Количество колонок в сетке (1-12)',
        },
        {
            name: 'rows',
            type: 'number',
            label: 'Строки',
            default: 1,
            min: 1,
            description: 'Количество строк в сетке',
        },
        {
            name: 'gap',
            type: 'number',
            label: 'Отступ',
            default: 24,
            min: 0,
            description: 'Расстояние между элементами в пикселях',
        },
        {
            name: 'variant',
            type: 'select',
            label: 'Вариант Bento',
            default: 'default',
            description: 'Предустановленные варианты расположения элементов',
            options: [
                { label: 'По умолчанию', value: 'default' },
                { label: 'Ведущий слева', value: 'lead-left' },
                { label: 'Ведущий справа', value: 'lead-right' },
            ],
        },
        {
            name: 'rowHeight',
            type: 'select',
            label: 'Высота строки',
            default: 'auto',
            description: 'Режим высоты строк грида',
            options: [
                { label: 'Авто (по контенту)', value: 'auto' },
                { label: 'Равные строки (1fr)', value: '1fr' },
                { label: 'Минимум контента', value: 'min-content' },
                { label: 'Максимум контента', value: 'max-content' },
            ],
        },
        {
            name: 'minRowHeight',
            type: 'number',
            label: 'Мин. высота строки (rem)',
            default: 0,
            min: 0,
            description: 'Минимальная высота строки в rem (0 = без ограничения)',
        },
        {
            name: 'paddingX',
            type: 'number',
            label: 'Padding горизонтальный (rem)',
            default: 0,
            min: 0,
            step: 0.2,
            description: 'Горизонтальный внутренний отступ контейнера в rem',
        },
        {
            name: 'paddingY',
            type: 'number',
            label: 'Padding вертикальный (rem)',
            default: 0,
            min: 0,
            step: 0.2,
            description: 'Вертикальный внутренний отступ контейнера в rem',
        },
    ],
};
