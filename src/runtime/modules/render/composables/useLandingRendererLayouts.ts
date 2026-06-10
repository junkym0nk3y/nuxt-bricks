// #region Imports
// Vue
import { h, type VNode } from 'vue';
import type {
    AccordionLayoutProps,
    GridLayoutVariant,
    GridRowHeight,
    ILandingSvgProps,
    LandingComponent,
    SectionLayoutProps,
    SliderLayoutProps,
} from '../../common/types/landing';
import type { ILandingRendererLayoutsOptions } from '../types/render';

// Utils
import { convertPxToRem } from '../../common/utils/main';

// Components
import BricksText from '../../layouts-blocks/components/BricksText.vue';
import BricksTitle from '../../layouts-blocks/components/BricksTitle.vue';
import BlockMedia from '../../layouts-blocks/components/BlockMedia.vue';
import BricksSvg from '../../layouts-blocks/components/BricksSvg.vue';
import BricksSlider from '../../layouts-blocks/components/BricksSlider.vue';
import BricksAccordion from '../../layouts-blocks/components/BricksAccordion.vue';
// #endregion

/** Округляет значение в rem до 1 десятичного знака */
function toRem(v: unknown): string {
    return `${Math.round(Math.max(0, Number(v) || 0) * 10) / 10}rem`;
}

/** Resolve значения с учётом override */
function resolveRV<T>(base: T, overrides: Record<string, any>, key: string): T {
    return key in overrides ? (overrides[key] as T) : base;
}

/** Создаёт тройку CSS-переменных (desktop/tablet/mobile) для responsive свойства */
function makeResponsiveVars(
    prefix: string,
    base: unknown,
    tabletOv: Record<string, any>,
    mobileOv: Record<string, any>,
    key: string,
    transform: (v: unknown) => string = String
): Record<string, string> {
    return {
        [`${prefix}-desktop`]: transform(base),
        [`${prefix}-tablet`]: transform(resolveRV(base, tabletOv, key)),
        [`${prefix}-mobile`]: transform(resolveRV(base, mobileOv, key)),
    };
}

/**
 * Composable для рендеринга layout-компонентов лендинга.
 * Предоставляет функции для рендеринга Grid, Flex, Space, Title, Text, Media, Slider и Accordion.
 *
 * @param options - Опции с данными схемы, стилями и функцией рендеринга дочерних компонентов.
 * @returns Объект с функциями needsContainerWrapper и renderLayoutComponent.
 */
export function useLandingRendererLayouts({
    allComponents,
    styles,
    renderChild,
}: ILandingRendererLayoutsOptions) {
    // #region Methods
    /**
     * Нормализует вариант Grid.
     *
     * @param value - Любое значение из props.
     * @returns Валидный вариант Grid.
     */
    function normalizeGridVariant(value: unknown): GridLayoutVariant {
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
        variant: GridLayoutVariant,
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
     * Возвращает объект overrides для конкретного device из `props.responsive`.
     *
     * @param props - Пропсы layout-компонента.
     * @param device - Ключ устройства.
     */
    function getResponsiveOverrides(
        props: Record<string, any>,
        device: 'mobile' | 'tablet' | 'desktop'
    ): Record<string, any> {
        const rawResponsive = props?.responsive;
        if (!rawResponsive || typeof rawResponsive !== 'object') {
            return {};
        }

        const responsive = rawResponsive as Record<string, unknown>;
        const overrides = responsive[device];

        return overrides && typeof overrides === 'object' ? (overrides as Record<string, any>) : {};
    }

    /** @see resolveRV — module-level alias */
    const resolveResponsiveValue = resolveRV;

    /**
     * Возвращает список дочерних компонентов.
     *
     * @param component - Родительский layout.
     * @returns Отфильтрованный список дочерних компонентов.
     */
    function getChildComponents(component: LandingComponent): LandingComponent[] {
        if (!component.children || !allComponents.value.length) {
            return [];
        }

        return component.children
            .map((childId) => allComponents.value.find((item) => item.id === childId))
            .filter(Boolean) as LandingComponent[];
    }

    /**
     * Проверяет, нужен ли контейнер с ограничением ширины.
     *
     * @param component - Компонент верхнего уровня.
     * @returns Требуется ли контейнер.
     */
    function needsContainerWrapper(component: LandingComponent): boolean {
        if (component.parent) {
            return false;
        }

        return component.fullWidth !== true;
    }

    /**
     * Рендерит layout по его типу.
     *
     * @param component - Компонент схемы.
     * @returns VNode layout-компонента или `null`.
     */
    /**
     * Рендерит layout по его типу, дополняя классами из внешнего контекста (например, device visibility).
     *
     * @param component - Компонент схемы.
     * @param extraClasses - Дополнительные классы.
     * @returns VNode layout-компонента или `null`.
     */
    function renderLayoutComponent(
        component: LandingComponent,
        extraClasses: string[] = [],
        extraAttrs: Record<string, string | undefined> = {}
    ): VNode | null {
        switch (component.componentName) {
            case 'Grid':
                return renderGridComponent(component, extraClasses, extraAttrs);
            case 'Flex':
                return renderFlexComponent(component, extraClasses, extraAttrs);
            case 'Section':
                return renderSectionComponent(component, extraClasses, extraAttrs);
            case 'Space':
                return renderSpaceComponent(component, extraClasses, extraAttrs);
            case 'Title':
                return renderTitleComponent(component, extraClasses, extraAttrs);
            case 'Text':
                return renderTextComponent(component, extraClasses, extraAttrs);
            case 'Media':
                return renderMediaComponent(component, extraClasses, extraAttrs);
            case 'Svg':
                return renderSvgComponent(component, extraClasses, extraAttrs);
            case 'Slider':
                return renderSliderComponent(component, extraClasses, extraAttrs);
            case 'Accordion':
                return renderAccordionComponent(component, extraClasses, extraAttrs);
            default:
                return null;
        }
    }

    /**
     * Нормализует значение rowHeight для Grid.
     *
     * @param value - Значение из props.
     * @returns Валидное значение rowHeight.
     */
    function normalizeGridRowHeight(value: unknown): GridRowHeight {
        if (
            value === 'auto' ||
            value === '1fr' ||
            value === 'min-content' ||
            value === 'max-content'
        ) {
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
        rowHeight: GridRowHeight,
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
     * Рендерит grid layout.
     *
     * @param component - Grid-компонент.
     * @returns VNode grid-компонента.
     */
    // eslint-disable-next-line complexity
    function renderGridComponent(
        component: LandingComponent,
        extraClasses: string[],
        extraAttrs: Record<string, string | undefined>
    ): VNode {
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
        const gridRowsMobile = buildGridTemplateRows(
            rowsMobile,
            rowHeightMobile,
            minRowHeightMobile
        );
        const gridRowsTablet = buildGridTemplateRows(
            rowsTablet,
            rowHeightTablet,
            minRowHeightTablet
        );
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

        if (component.gridColumn) {
            style.gridColumn = component.gridColumn;
        }
        if (component.gridRow) {
            style.gridRow = component.gridRow;
        }

        const childComponents = getChildComponents(component);

        return h(
            'div',
            {
                id: component.htmlId || undefined,
                style,
                class: [styles.landingGrid, ...extraClasses],
                'data-bricks-layout': 'grid',
                ...extraAttrs,
            },
            childComponents.map((child) => renderChild(child))
        );
    }

    /**
     * Рендерит flex layout.
     *
     * @param component - Flex-компонент.
     * @returns VNode flex-компонента.
     */
    function renderFlexComponent(
        component: LandingComponent,
        extraClasses: string[],
        extraAttrs: Record<string, string | undefined>
    ): VNode {
        const currentProps = component.props as Record<string, any>;

        const baseDirection = String(currentProps.direction || 'row');
        const baseJustify = mapFlexJustify(currentProps.justify);
        const baseGap = Math.max(0, Number(currentProps.gap || 24));

        const mobileOverrides = getResponsiveOverrides(currentProps, 'mobile');
        const tabletOverrides = getResponsiveOverrides(currentProps, 'tablet');

        const directionMobile = String(
            resolveResponsiveValue(baseDirection, mobileOverrides, 'direction')
        );
        const directionTablet = String(
            resolveResponsiveValue(baseDirection, tabletOverrides, 'direction')
        );
        const directionDesktop = baseDirection;

        const justifyMobile = mapFlexJustify(
            resolveResponsiveValue(currentProps.justify, mobileOverrides, 'justify')
        );
        const justifyTablet = mapFlexJustify(
            resolveResponsiveValue(currentProps.justify, tabletOverrides, 'justify')
        );
        const justifyDesktop = baseJustify;

        const wrapMobileRaw = resolveResponsiveValue(
            Boolean(currentProps.wrap),
            mobileOverrides,
            'wrap'
        );
        const wrapTabletRaw = resolveResponsiveValue(
            Boolean(currentProps.wrap),
            tabletOverrides,
            'wrap'
        );
        const wrapDesktopRaw = Boolean(currentProps.wrap);

        const wrapMobile = wrapMobileRaw ? 'wrap' : 'nowrap';
        const wrapTablet = wrapTabletRaw ? 'wrap' : 'nowrap';
        const wrapDesktop = wrapDesktopRaw ? 'wrap' : 'nowrap';

        const gapMobile = Math.max(
            0,
            Number(resolveResponsiveValue(baseGap, mobileOverrides, 'gap')) || baseGap
        );
        const gapTablet = Math.max(
            0,
            Number(resolveResponsiveValue(baseGap, tabletOverrides, 'gap')) || baseGap
        );
        const gapDesktop = baseGap;

        const style = {
            display: 'flex',
            flexDirection: 'var(--bricks-flex-direction, var(--bricks-flex-direction-desktop, row))',
            justifyContent: 'var(--bricks-flex-justify, var(--bricks-flex-justify-desktop, flex-start))',
            alignItems: mapFlexAlign(currentProps.align),
            flexWrap: 'var(--bricks-flex-wrap, var(--bricks-flex-wrap-desktop, nowrap))',
            gap: 'var(--bricks-flex-gap, var(--bricks-flex-gap-desktop, 0rem))',
            minHeight: 'auto',
            backgroundColor: 'transparent',
            border: 'none',
            borderRadius: '0',
            '--bricks-flex-direction-mobile': directionMobile,
            '--bricks-flex-direction-tablet': directionTablet,
            '--bricks-flex-direction-desktop': directionDesktop,
            '--bricks-flex-justify-mobile': justifyMobile,
            '--bricks-flex-justify-tablet': justifyTablet,
            '--bricks-flex-justify-desktop': justifyDesktop,
            '--bricks-flex-wrap-mobile': wrapMobile,
            '--bricks-flex-wrap-tablet': wrapTablet,
            '--bricks-flex-wrap-desktop': wrapDesktop,
            '--bricks-flex-gap-mobile': convertPxToRem(gapMobile),
            '--bricks-flex-gap-tablet': convertPxToRem(gapTablet),
            '--bricks-flex-gap-desktop': convertPxToRem(gapDesktop),
        };

        const basePaddingX = Math.round(Math.max(0, Number(currentProps.paddingX) || 0) * 10) / 10;
        const basePaddingY = Math.round(Math.max(0, Number(currentProps.paddingY) || 0) * 10) / 10;

        if (basePaddingX > 0 || basePaddingY > 0) {
            (style as Record<string, string>).padding = `${basePaddingY}rem ${basePaddingX}rem`;
        }

        if (component.gridColumn) {
            (style as Record<string, string>).gridColumn = component.gridColumn;
        }
        if (component.gridRow) {
            (style as Record<string, string>).gridRow = component.gridRow;
        }

        const childComponents = getChildComponents(component);

        return h(
            'div',
            {
                id: component.htmlId || undefined,
                style,
                class: [styles.landingFlex, ...extraClasses],
                'data-bricks-layout': 'flex',
                ...extraAttrs,
            },
            childComponents.map((child) => renderChild(child))
        );
    }

    /**
     * Рендерит Section layout (обёртка с фоном).
     *
     * @param component - Section-компонент.
     * @returns VNode section-компонента.
     */
    function renderSectionComponent(
        component: LandingComponent,
        extraClasses: string[],
        extraAttrs: Record<string, string | undefined>
    ): VNode {
        const cp = component.props as SectionLayoutProps;
        const mOv = getResponsiveOverrides(cp as Record<string, any>, 'mobile');
        const tOv = getResponsiveOverrides(cp as Record<string, any>, 'tablet');

        const style: Record<string, string> = {
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            padding: 'var(--bricks-section-pt) var(--bricks-section-px) var(--bricks-section-pb)',
            borderRadius: 'var(--bricks-section-radius)',
            minHeight: 'var(--bricks-section-min-h)',
            ...makeResponsiveVars('--bricks-section-pt', cp.paddingTop, tOv, mOv, 'paddingTop', toRem),
            ...makeResponsiveVars(
                '--bricks-section-pb',
                cp.paddingBottom,
                tOv,
                mOv,
                'paddingBottom',
                toRem
            ),
            ...makeResponsiveVars('--bricks-section-px', cp.paddingX, tOv, mOv, 'paddingX', toRem),
            ...makeResponsiveVars(
                '--bricks-section-radius',
                cp.borderRadius,
                tOv,
                mOv,
                'borderRadius',
                toRem
            ),
            ...makeResponsiveVars(
                '--bricks-section-min-h',
                cp.minHeight,
                tOv,
                mOv,
                'minHeight',
                toRem
            ),
        };

        if (cp.backgroundColor) {
            style.backgroundColor = cp.backgroundColor;
        }

        if (cp.backgroundImage) {
            style.backgroundImage = `url(${cp.backgroundImage})`;
            style.backgroundSize = 'cover';
            style.backgroundPosition = 'center';
        }

        if (component.gridColumn) {
            style.gridColumn = component.gridColumn;
        }
        if (component.gridRow) {
            style.gridRow = component.gridRow;
        }

        const childComponents = getChildComponents(component);

        return h(
            'div',
            {
                id: component.htmlId || undefined,
                style,
                class: [styles.landingSection, ...extraClasses],
                'data-bricks-layout': 'section',
                ...extraAttrs,
            },
            childComponents.map((child) => renderChild(child))
        );
    }

    /**
     * Рендерит компонент-проставку Space.
     *
     * @param component - Space-компонент.
     * @returns VNode spacer-компонента.
     */
    function renderSpaceComponent(
        component: LandingComponent,
        extraClasses: string[],
        extraAttrs: Record<string, string | undefined>
    ): VNode {
        const currentProps = component.props as Record<string, any>;
        const mOv = getResponsiveOverrides(currentProps, 'mobile');
        const tOv = getResponsiveOverrides(currentProps, 'tablet');

        const toSize = (v: unknown): string =>
            normalizeSpacingSize((v || '2.4rem') as string | number);

        const style: Record<string, string> = {
            backgroundColor: 'transparent',
            border: 'none',
            borderRadius: '0',
            ...makeResponsiveVars('--bricks-space-size', currentProps.size, tOv, mOv, 'size', toSize),
            ...makeResponsiveVars(
                '--bricks-space-divider-mx',
                currentProps.dividerMarginX,
                tOv,
                mOv,
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

        if (component.gridColumn) {
            style.gridColumn = component.gridColumn;
        }
        if (component.gridRow) {
            style.gridRow = component.gridRow;
        }

        const isVertical =
            currentProps.direction === 'vertical' || currentProps.direction === 'both';
        const dividerChildren = currentProps.showDivider
            ? [renderSpaceDivider(currentProps, isVertical)]
            : undefined;

        return h(
            'div',
            {
                id: component.htmlId || undefined,
                style,
                class: [styles.landingSpace, ...extraClasses],
                'data-bricks-layout': 'space',
                ...extraAttrs,
            },
            dividerChildren
        );
    }

    /**
     * Рендерит линию-разделитель внутри Space.
     */
    function renderSpaceDivider(spaceProps: Record<string, any>, isVertical: boolean): VNode {
        const color = spaceProps.dividerColor || 'var(--land-base-200)';
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
     * Рендерит layout Title.
     *
     * @param component - Компонент заголовка.
     * @returns VNode Title.
     */
    function renderTitleComponent(
        component: LandingComponent,
        extraClasses: string[],
        extraAttrs: Record<string, string | undefined>
    ): VNode {
        const componentProps = component.props as SliderLayoutProps;
        const style: Record<string, string> = {};
        if (component.gridColumn) {
            style.gridColumn = component.gridColumn;
        }
        if (component.gridRow) {
            style.gridRow = component.gridRow;
        }

        return h(BricksTitle, {
            ...componentProps,
            key: component.id,
            id: component.htmlId || undefined,
            class: [styles.landingTitle, ...extraClasses],
            style: Object.keys(style).length ? style : undefined,
            ...extraAttrs,
        });
    }

    /**
     * Рендерит layout Text.
     *
     * @param component - Компонент текста.
     * @returns VNode Text.
     */
    function renderTextComponent(
        component: LandingComponent,
        extraClasses: string[],
        extraAttrs: Record<string, string | undefined>
    ): VNode {
        const componentProps = component.props as Record<string, any>;
        const style: Record<string, string> = {};
        if (component.gridColumn) {
            style.gridColumn = component.gridColumn;
        }
        if (component.gridRow) {
            style.gridRow = component.gridRow;
        }

        return h(BricksText, {
            ...componentProps,
            key: component.id,
            id: component.htmlId || undefined,
            class: [styles.landingText, ...extraClasses],
            style: Object.keys(style).length ? style : undefined,
            ...extraAttrs,
        });
    }

    /**
     * Рендерит layout Media.
     *
     * @param component - Медиа-компонент.
     * @returns VNode медиа-компонента.
     */
    function renderMediaComponent(
        component: LandingComponent,
        extraClasses: string[],
        extraAttrs: Record<string, string | undefined>
    ): VNode {
        const cp = component.props as Record<string, any>;
        const mOv = getResponsiveOverrides(cp, 'mobile');
        const tOv = getResponsiveOverrides(cp, 'tablet');

        const style: Record<string, string> = {
            ...makeResponsiveVars('--bricks-media-width', cp.width || '100%', tOv, mOv, 'width'),
            ...makeResponsiveVars('--bricks-media-height', cp.height || 'auto', tOv, mOv, 'height'),
            ...makeResponsiveVars(
                '--bricks-media-radius',
                cp.borderRadius || '0',
                tOv,
                mOv,
                'borderRadius'
            ),
        };
        if (component.gridColumn) {
            style.gridColumn = component.gridColumn;
        }
        if (component.gridRow) {
            style.gridRow = component.gridRow;
        }

        return h(BlockMedia, {
            ...cp,
            width: 'var(--bricks-media-width)',
            height: 'var(--bricks-media-height)',
            borderRadius: 'var(--bricks-media-radius)',
            key: component.id,
            id: component.htmlId || undefined,
            class: [styles.landingImage, ...extraClasses],
            style,
            'data-bricks-layout': 'media',
            ...extraAttrs,
        });
    }

    /**
     * Рендерит SVG-блок.
     *
     * @param component - Svg-компонент.
     * @returns VNode SVG-блока.
     */
    function renderSvgComponent(
        component: LandingComponent,
        extraClasses: string[],
        extraAttrs: Record<string, string | undefined>
    ): VNode {
        const cp = component.props as ILandingSvgProps;
        const mOv = getResponsiveOverrides(cp as Record<string, any>, 'mobile');
        const tOv = getResponsiveOverrides(cp as Record<string, any>, 'tablet');

        const style: Record<string, string> = {
            ...makeResponsiveVars('--bricks-media-width', cp.width || '4.8rem', tOv, mOv, 'width'),
            ...makeResponsiveVars('--bricks-media-height', cp.height || '4.8rem', tOv, mOv, 'height'),
            '--bricks-media-radius-desktop': '0',
            '--bricks-media-radius-tablet': '0',
            '--bricks-media-radius-mobile': '0',
        };
        if (component.gridColumn) {
            style.gridColumn = component.gridColumn;
        }
        if (component.gridRow) {
            style.gridRow = component.gridRow;
        }

        return h(BricksSvg, {
            ...cp,
            width: 'var(--bricks-media-width)',
            height: 'var(--bricks-media-height)',
            key: component.id,
            id: component.htmlId || undefined,
            class: [styles.landingSvg, ...extraClasses],
            style,
            'data-bricks-layout': 'svg',
            ...extraAttrs,
        });
    }

    /**
     * Рендерит layout Slider с поддержкой слайдов.
     *
     * @param component - Slider-компонент.
     * @returns VNode слайдера.
     */
    function renderSliderComponent(
        component: LandingComponent,
        extraClasses: string[],
        extraAttrs: Record<string, string | undefined>
    ): VNode {
        const componentProps = component.props as SliderLayoutProps;
        const childComponents = getChildComponents(component);
        const style: Record<string, string> = {};
        if (component.gridColumn) {
            style.gridColumn = component.gridColumn;
        }
        if (component.gridRow) {
            style.gridRow = component.gridRow;
        }

        return h(BricksSlider, {
            layoutProps: componentProps,
            layoutId: component.id,
            slides: childComponents,
            renderSlide: (child: LandingComponent) => renderChild(child),
            isEditor: false,
            key: component.id,
            id: component.htmlId || undefined,
            class: extraClasses,
            style: Object.keys(style).length ? style : undefined,
            ...extraAttrs,
        });
    }

    /**
     * Рендерит layout Accordion.
     *
     * @param component - Accordion-компонент.
     * @returns VNode аккордеона.
     */
    function renderAccordionComponent(
        component: LandingComponent,
        extraClasses: string[],
        extraAttrs: Record<string, string | undefined>
    ): VNode {
        const componentProps = component.props as AccordionLayoutProps;
        const style: Record<string, string> = {};
        if (component.gridColumn) {
            style.gridColumn = component.gridColumn;
        }
        if (component.gridRow) {
            style.gridRow = component.gridRow;
        }

        return h(BricksAccordion, {
            layoutProps: componentProps,
            key: component.id,
            id: component.htmlId || undefined,
            class: extraClasses,
            style: Object.keys(style).length ? style : undefined,
            ...extraAttrs,
        });
    }

    /**
     * Нормализует значение отступа в rem.
     * Числа интерпретируются как rem (например, 2.4 → "2.4rem").
     * Строки с px конвертируются в rem.
     *
     * @param size - Значение отступа (число в rem или строка).
     * @returns Нормализованное значение в rem.
     */
    function normalizeSpacingSize(size: string | number): string {
        // Числа уже в rem - просто добавляем единицу измерения
        if (typeof size === 'number') {
            return `${size}rem`;
        }

        // Строка с px - конвертируем в rem
        if (size.endsWith('px')) {
            const numericValue = Number(size.replace('px', ''));
            return convertPxToRem(Number.isFinite(numericValue) ? numericValue : 0);
        }

        // Остальные строки возвращаем как есть (уже с единицей измерения)
        return size;
    }

    /**
     * Маппит значение align в CSS flex align-items.
     *
     * @param align - Значение ('stretch', 'start', 'center', 'end', 'baseline').
     * @returns CSS-значение для align-items.
     */
    function mapFlexAlign(align?: string): string {
        switch (align) {
            case 'start':
                return 'flex-start';
            case 'center':
                return 'center';
            case 'end':
                return 'flex-end';
            case 'baseline':
                return 'baseline';
            case 'stretch':
            default:
                return 'stretch';
        }
    }

    /**
     * Маппит значение justify в CSS flex justify-content.
     *
     * @param justify - Значение выравнивания ('start', 'center', 'end', 'space-between', 'space-around').
     * @returns CSS-значение для justify-content.
     */
    function mapFlexJustify(justify?: string): string {
        switch (justify) {
            case 'center':
                return 'center';
            case 'end':
                return 'flex-end';
            case 'space-between':
                return 'space-between';
            case 'space-around':
                return 'space-around';
            case 'start':
            default:
                return 'flex-start';
        }
    }

    // #endregion

    return {
        needsContainerWrapper,
        renderLayoutComponent,
    };
}
