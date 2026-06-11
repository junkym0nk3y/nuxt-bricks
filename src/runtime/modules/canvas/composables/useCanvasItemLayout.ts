// #region Imports
// Types
import type { BricksComponent, TBricksDeviceKey } from '../../common/types/brick';
import type { LayoutProps } from '../../layouts-blocks/types/blockProps';
import type { IItemStyle, ICanvasItemProps } from '../components/types';

// Vue
import { computed, inject } from 'vue';

// Pinia
import { useComponentsStore } from '../../builder/stores/components';
import { useCanvasStore } from '../../builder/stores/canvas';

// Utils
import { resolveBlockProps } from '../../layouts-blocks/registry';
import { CANVAS_VIEWPORT_KEY } from '../../common/constants/injectionKeys';
// #endregion

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
 * Резолв пропсов по viewport делегирован registry (resolveBlockProps);
 * здесь остаётся item-level логика (grid-column clamp по родительскому Grid).
 */
export function useCanvasItemLayout(props: ICanvasItemProps) {
    const componentsStore = useComponentsStore();
    const canvasStore = useCanvasStore();
    const injectedViewport = inject(CANVAS_VIEWPORT_KEY, null);

    /** В Figma mode — per-viewport от CanvasViewport, в обычном — от TheCanvas (fallback — store) */
    const effectiveViewport = computed<TBricksDeviceKey>(
        () => injectedViewport?.value ?? canvasStore.viewport
    );

    const isLayout = computed<boolean>(() => props.component.type === 'layout');
    const layoutName = computed<string>(() => props.component.componentName.toLowerCase());
    const isSpaceLayout = computed<boolean>(() => isLayout.value && layoutName.value === 'space');

    /**
     * Возвращает количество колонок родительского Grid-layout для текущего viewport.
     */
    function getParentGridColumns(
        component: BricksComponent,
        viewport: TBricksDeviceKey
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

        const parentLayoutProps = resolveBlockProps(
            parent.componentName,
            (parent.props ?? {}) as Record<string, unknown>,
            viewport
        );
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

        return resolveBlockProps(
            props.component.componentName,
            (props.component.props ?? {}) as Record<string, unknown>,
            effectiveViewport.value
        ) as LayoutProps;
    });

    const childComponents = computed<BricksComponent[]>(() => {
        if (!isLayout.value || !props.component.children) {
            return [];
        }

        return props.component.children
            .map((childId) => componentsStore.getComponentById(childId))
            .filter(Boolean) as BricksComponent[];
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
