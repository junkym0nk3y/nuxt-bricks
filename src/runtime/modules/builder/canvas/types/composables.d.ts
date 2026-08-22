/**
 * Types for composables of the canvas domain.
 */

import type { IComponentSlotDefinition, IBricksComponent } from '../../../common/types/brick';
import type { ComputedRef, MaybeRefOrGetter, Ref, VNodeRef } from 'vue';

// #region useComponentSlots
/**
 * Data for rendering a slot together with its child components.
 */
export interface ISlotRenderData {
    slot: IComponentSlotDefinition;
    children: IBricksComponent[];
}

/**
 * Return value of the useComponentSlots composable.
 */
export interface IUseComponentSlotsReturn {
    slotRenderData: ComputedRef<ISlotRenderData[]>;
    slotStringContent: ComputedRef<string>;
}
// #endregion

// #region useSlotDragDrop
/**
 * Drag-and-drop state of a single slot.
 */
export interface ISlotState {
    dragDepth: number;
    isDragOver: boolean;
    dropInsertIndex: number | null;
}

/**
 * Return value of the useSlotDragDrop composable.
 */
export interface IUseSlotDragDropReturn {
    getSlotDropIndex: (slotName: string) => number | null;
    setSlotContainerRef: (slotName: string) => VNodeRef;
    handleSlotDragEnter: (slotName: string, event: DragEvent) => void;
    handleSlotDragOver: (slotName: string, event: DragEvent) => void;
    handleSlotDragLeave: (slotName: string, event: DragEvent) => void;
    handleSlotDrop: (slotName: string, event: DragEvent) => void;
}
// #endregion

// #region useDraggableOverlay
/**
 * Options of the useDraggableOverlay composable (a draggable fixed overlay
 * bound to an anchor element on the canvas).
 */
export interface IDraggableOverlayOptions {
    /** Root element of the overlay (for ResizeObserver) */
    overlayRef: Ref<HTMLElement | null>;
    /** Anchor element the overlay position is bound to */
    anchorElement: MaybeRefOrGetter<HTMLElement | null>;
    /** Cursor offset at the moment of opening (from the top left corner of the anchor) */
    cursorOffset: () => { x: number; y: number } | null;
    /** Changing this value resets the drag offset */
    resetKey: () => unknown;
}
// #endregion

// #region useInlineEditingFallback
/**
 * Options of the useInlineEditingFallback composable.
 */
export interface IInlineEditingFallbackOptions {
    /** Called when the edited property is switched (resets the toolbar state) */
    onPropSwitch?: () => void;
}
// #endregion

// #region useCanvasContainerMetrics
/**
 * Options of the useCanvasContainerMetrics composable.
 */
export interface ICanvasContainerMetricsOptions {
    /** Root container of the canvas content (data-root-drop-zone) */
    containerRef: Ref<HTMLElement | null>;
    /** Scheduler of horizontal canvas centering */
    scheduleCanvasCenter: (behavior?: ScrollBehavior) => void;
    /** Scrolls to the selected component after a viewport switch or on leaving Figma mode */
    scrollToSelected: () => void;
}
// #endregion
