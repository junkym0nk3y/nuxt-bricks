// #region Imports
// Types
import type { IBricksComponent, TBricksDeviceKey } from '../../../../common/types/brick';
import type { TLayoutProps } from '../../../../layouts-blocks/types/blockProps';
import type { TItemStyle, ICanvasItemProps } from '../../types/components';

// Vue
import { computed, inject } from 'vue';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';
import { useCanvasStore } from '../../../core/stores/canvas';

// Utils
import { resolveBlockProps } from '../../../../layouts-blocks/registry';
import { CANVAS_VIEWPORT_KEY } from '../../../../common/constants/injectionKeys';
// #endregion

/** Normalizes a `grid-column` value so a viewport switch creates no implicit columns */
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
 * Layout resolution of a canvas item: itemStyle, layoutProps, layoutName, childComponents,
 * isSpaceLayout. Resolving props per viewport is delegated to the registry
 * (resolveBlockProps); what stays here is the item-level logic (clamping grid-column
 * against the parent Grid).
 */
export function useCanvasItemLayout(props: ICanvasItemProps) {
    const componentsStore = useComponentsStore();
    const canvasStore = useCanvasStore();
    const injectedViewport = inject(CANVAS_VIEWPORT_KEY, null);

    /**
     * In Figma mode comes per viewport from BuilderCanvasViewport, in normal mode from
     * TheBuilderCanvas; the store is the fallback.
     */
    const effectiveViewport = computed<TBricksDeviceKey>(
        () => injectedViewport?.value ?? canvasStore.viewport
    );

    const isLayout = computed<boolean>(() => props.component.type === 'layout');
    const layoutName = computed<string>(() => props.component.componentName.toLowerCase());
    const isSpaceLayout = computed<boolean>(() => isLayout.value && layoutName.value === 'space');

    /**
     * Returns the column count of the parent Grid layout for the current viewport.
     */
    function getParentGridColumns(
        component: IBricksComponent,
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

    const itemStyle = computed<TItemStyle>(() => {
        const style: TItemStyle = { position: 'relative' };

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

    const layoutProps = computed<TLayoutProps>(() => {
        if (!isLayout.value) {
            return props.component.props as TLayoutProps;
        }

        return resolveBlockProps(
            props.component.componentName,
            (props.component.props ?? {}) as Record<string, unknown>,
            effectiveViewport.value
        ) as TLayoutProps;
    });

    const childComponents = computed<IBricksComponent[]>(() => {
        if (!isLayout.value || !props.component.children) {
            return [];
        }

        return props.component.children
            .map((childId) => componentsStore.getComponentById(childId))
            .filter(Boolean) as IBricksComponent[];
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
