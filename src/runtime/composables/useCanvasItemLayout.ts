// #region Imports
// Types
import type {
    LandingComponent,
    LayoutProps,
    GridLayoutProps,
    GridLayoutVariant,
    GridRowHeight,
    FlexLayoutProps,
    TLandingDeviceKey,
} from '../types/landing';
import type { IItemStyle, ILandingCanvasItemProps } from '../components/canvas/types';

// Vue
import { computed, inject } from 'vue';

// Pinia
import { useLandingComponentsStore } from '../store/landing/components';
import { useLandingCanvasStore } from '../store/landing/canvas';
// #endregion

/** Нормализует значение rowHeight для Grid */
function normalizeGridRowHeight(value: unknown): GridRowHeight {
    if (value === 'auto' || value === '1fr' || value === 'min-content' || value === 'max-content') {
        return value;
    }

    return 'auto';
}

/** Возвращает responsive overrides для выбранного viewport */
function getResponsiveOverridesForViewport(
    baseProps: Record<string, unknown>,
    viewport: 'mobile' | 'tablet' | 'desktop'
): Record<string, unknown> {
    if (viewport === 'desktop') {
        return {};
    }

    const responsive = (baseProps.responsive ?? {}) as Partial<
        Record<'mobile' | 'tablet' | 'desktop', Record<string, unknown>>
    >;

    return (responsive[viewport] ?? {}) as Record<string, unknown>;
}

/** Собирает типизированные props для Grid-layout с учётом overrides */
function resolveGridLayoutProps(
    baseProps: Record<string, unknown>,
    overrides: Record<string, unknown>
): GridLayoutProps {
    const rawColumns = overrides.columns ?? baseProps.columns;
    const rawRows = overrides.rows ?? baseProps.rows;
    const rawGap = overrides.gap ?? baseProps.gap;
    const rawVariant = overrides.variant ?? baseProps.variant;
    const rawRowHeight = overrides.rowHeight ?? baseProps.rowHeight;
    const rawMinRowHeight = overrides.minRowHeight ?? baseProps.minRowHeight;
    const rawPaddingX = overrides.paddingX ?? baseProps.paddingX;
    const rawPaddingY = overrides.paddingY ?? baseProps.paddingY;

    return {
        columns: Math.max(1, Math.floor(Number(rawColumns) || 1)),
        rows: Math.max(1, Math.floor(Number(rawRows) || 1)),
        gap: Math.max(0, Number(rawGap) || 0),
        variant: typeof rawVariant === 'string' ? (rawVariant as GridLayoutVariant) : undefined,
        rowHeight: normalizeGridRowHeight(rawRowHeight),
        minRowHeight: Math.max(0, Number(rawMinRowHeight) || 0),
        paddingX: Math.max(0, Number(rawPaddingX) || 0),
        paddingY: Math.max(0, Number(rawPaddingY) || 0),
    };
}

/** Собирает типизированные props для Flex-layout с учётом overrides */
function resolveFlexLayoutProps(
    baseProps: Record<string, unknown>,
    overrides: Record<string, unknown>
): FlexLayoutProps {
    const rawDirection = overrides.direction ?? baseProps.direction;
    const rawJustify = overrides.justify ?? baseProps.justify;
    const rawAlign = overrides.align ?? baseProps.align;
    const rawGap = overrides.gap ?? baseProps.gap;
    const rawWrap = overrides.wrap ?? baseProps.wrap;
    const rawPaddingX = overrides.paddingX ?? baseProps.paddingX;
    const rawPaddingY = overrides.paddingY ?? baseProps.paddingY;

    const direction: FlexLayoutProps['direction'] = rawDirection === 'column' ? 'column' : 'row';

    const justify: FlexLayoutProps['justify'] =
        rawJustify === 'center' ||
        rawJustify === 'end' ||
        rawJustify === 'space-between' ||
        rawJustify === 'space-around'
            ? rawJustify
            : 'start';

    const align: FlexLayoutProps['align'] =
        rawAlign === 'start' ||
        rawAlign === 'center' ||
        rawAlign === 'end' ||
        rawAlign === 'baseline'
            ? rawAlign
            : 'stretch';

    return {
        direction,
        justify,
        align,
        gap: Math.max(0, Number(rawGap) || 0),
        wrap: Boolean(rawWrap),
        paddingX: Math.max(0, Number(rawPaddingX) || 0),
        paddingY: Math.max(0, Number(rawPaddingY) || 0),
    };
}

/** Возвращает типизированные пропсы layout-компонента с учётом responsive overrides */
function resolveLayoutProps(
    component: LandingComponent,
    viewport: 'mobile' | 'tablet' | 'desktop'
): LayoutProps {
    const currentLayout = component.componentName.toLowerCase();

    const baseProps = (component.props ?? {}) as Record<string, unknown>;

    if (
        currentLayout !== 'grid' &&
        currentLayout !== 'flex' &&
        currentLayout !== 'section' &&
        currentLayout !== 'space' &&
        currentLayout !== 'media' &&
        currentLayout !== 'svg'
    ) {
        return baseProps as LayoutProps;
    }

    const overrides = getResponsiveOverridesForViewport(baseProps, viewport);

    if (currentLayout === 'grid') {
        return resolveGridLayoutProps(baseProps, overrides);
    }

    if (currentLayout === 'flex') {
        return resolveFlexLayoutProps(baseProps, overrides);
    }

    // Section, Space, Media, Svg — простой merge responsive overrides
    return { ...baseProps, ...overrides } as LayoutProps;
}

/** Нормализует значение `grid-column`, чтобы не создавать implicit columns при смене viewport */
function clampGridColumnToColumns(gridColumn: string, columns: number): string | undefined {
    const normalizedColumns = Math.max(1, Math.floor(columns));
    const trimmed = gridColumn.trim();

    if (!trimmed) {
        return undefined;
    }

    const spanMatch = trimmed.match(/^span\s+(-?\d+)\s*$/i);
    if (spanMatch) {
        const rawSpan = Number(spanMatch[1]);
        const span = Math.max(1, Math.min(normalizedColumns, Math.floor(rawSpan) || 1));
        return `span ${span}`;
    }

    const parts = trimmed.split('/').map((part) => part.trim());
    if (parts.length !== 2) {
        return undefined;
    }

    const startRaw = parts[0];
    const endRaw = parts[1];

    if (startRaw.includes('-') || endRaw.includes('-')) {
        return trimmed;
    }

    const startParsed = Number(startRaw);
    const endParsed = Number(endRaw);

    if (!Number.isFinite(startParsed) || !Number.isFinite(endParsed)) {
        return undefined;
    }

    const start = Math.max(1, Math.min(normalizedColumns, Math.floor(startParsed)));
    let end = Math.floor(endParsed);

    const maxLine = normalizedColumns + 1;
    end = Math.max(2, Math.min(maxLine, end));

    if (end <= start) {
        end = Math.min(maxLine, start + 1);
    }

    return `${start} / ${end}`;
}

/**
 * Инкапсулирует логику layout-разрешения для элемента канваса:
 * itemStyle, layoutProps, layoutName, childComponents, isSpaceLayout.
 */
export function useCanvasItemLayout(props: ILandingCanvasItemProps) {
    const componentsStore = useLandingComponentsStore();
    const canvasStore = useLandingCanvasStore();
    const injectedViewport = inject<TLandingDeviceKey | null>('canvasViewport', null);

    /** В Figma mode используем injected viewport от LandingCanvasViewport, иначе глобальный */
    const effectiveViewport = computed<TLandingDeviceKey>(
        () => injectedViewport ?? canvasStore.viewport
    );

    const isLayout = computed<boolean>(() => props.component.type === 'layout');
    const layoutName = computed<string>(() => props.component.componentName.toLowerCase());
    const isSpaceLayout = computed<boolean>(() => isLayout.value && layoutName.value === 'space');

    /**
     * Возвращает количество колонок родительского Grid-layout для текущего viewport.
     */
    function getParentGridColumns(
        component: LandingComponent,
        viewport: 'mobile' | 'tablet' | 'desktop'
    ): number | null {
        if (!component.parent) {
            return null;
        }

        const parent = componentsStore.getComponentById(component.parent);
        if (!parent || parent.type !== 'layout') {
            return null;
        }

        if (parent.componentName.toLowerCase() !== 'grid') {
            return null;
        }

        const parentLayoutProps = resolveLayoutProps(parent, viewport) as GridLayoutProps;
        return Math.max(1, Number(parentLayoutProps.columns) || 1);
    }

    const itemStyle = computed<IItemStyle>(() => {
        const style: IItemStyle = { position: 'relative' };

        if (props.component.gridColumn) {
            const parentGridColumns = getParentGridColumns(
                props.component,
                effectiveViewport.value
            );

            if (!parentGridColumns) {
                style.gridColumn = props.component.gridColumn;
            } else {
                const clamped = clampGridColumnToColumns(
                    props.component.gridColumn,
                    parentGridColumns
                );
                if (clamped) {
                    style.gridColumn = clamped;
                }
            }
        }

        if (props.component.gridRow) {
            style.gridRow = props.component.gridRow;
        }

        return style;
    });

    const layoutProps = computed<LayoutProps>(() => {
        if (!isLayout.value) {
            return props.component.props as LayoutProps;
        }

        return resolveLayoutProps(props.component, effectiveViewport.value);
    });

    const childComponents = computed<LandingComponent[]>(() => {
        if (!isLayout.value || !props.component.children) {
            return [];
        }

        return props.component.children
            .map((childId) => componentsStore.getComponentById(childId))
            .filter(Boolean) as LandingComponent[];
    });

    return {
        isLayout,
        layoutName,
        isSpaceLayout,
        itemStyle,
        layoutProps,
        childComponents,
    };
}
