/**
 * Типы для composables домена canvas.
 */

import type { ComponentSlotDefinition, BricksComponent } from '../../../common/types/brick';
import type { ComputedRef, CSSProperties, Ref, VNodeRef } from 'vue';

// #region useComponentSlots
/**
 * Данные для рендеринга слота с дочерними компонентами.
 */
export interface ISlotRenderData {
    slot: ComponentSlotDefinition;
    children: BricksComponent[];
}

/**
 * Возвращаемое значение composable useComponentSlots.
 */
export interface IUseComponentSlotsReturn {
    slotRenderData: ComputedRef<ISlotRenderData[]>;
    slotStringContent: ComputedRef<string>;
    hasLoadedSlots: Ref<boolean>;
}
// #endregion

// #region useSlotDragDrop
/**
 * Состояние drag-and-drop для одного слота.
 */
export interface ISlotState {
    dragDepth: number;
    isDragOver: boolean;
    dropIndicator: { index: number; offset: number } | null;
    dropInsertIndex: number | null;
}

/**
 * Возвращаемое значение composable useSlotDragDrop.
 */
export interface IUseSlotDragDropReturn {
    slotIndicatorStyles: ComputedRef<Record<string, CSSProperties>>;
    getSlotIndicatorStyle: (slotName: string) => CSSProperties;
    setSlotContainerRef: (slotName: string) => VNodeRef;
    handleSlotDragEnter: (slotName: string, event: DragEvent) => void;
    handleSlotDragOver: (slotName: string, event: DragEvent) => void;
    handleSlotDragLeave: (slotName: string, event: DragEvent) => void;
    handleSlotDrop: (slotName: string, event: DragEvent) => void;
}
// #endregion
