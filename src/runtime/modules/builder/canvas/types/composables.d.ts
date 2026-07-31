/**
 * Типы для composables домена canvas.
 */

import type { IComponentSlotDefinition, IBricksComponent } from '../../../common/types/brick';
import type { ComputedRef, MaybeRefOrGetter, Ref, VNodeRef } from 'vue';

// #region useComponentSlots
/**
 * Данные для рендеринга слота с дочерними компонентами.
 */
export interface ISlotRenderData {
    slot: IComponentSlotDefinition;
    children: IBricksComponent[];
}

/**
 * Возвращаемое значение composable useComponentSlots.
 */
export interface IUseComponentSlotsReturn {
    slotRenderData: ComputedRef<ISlotRenderData[]>;
    slotStringContent: ComputedRef<string>;
}
// #endregion

// #region useSlotDragDrop
/**
 * Состояние drag-and-drop для одного слота.
 */
export interface ISlotState {
    dragDepth: number;
    isDragOver: boolean;
    dropInsertIndex: number | null;
}

/**
 * Возвращаемое значение composable useSlotDragDrop.
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
 * Опции composable useDraggableOverlay (перетаскиваемый fixed-overlay,
 * привязанный к якорному элементу на канвасе).
 */
export interface IDraggableOverlayOptions {
    /** Корневой элемент overlay (для ResizeObserver). */
    overlayRef: Ref<HTMLElement | null>;
    /** Якорный элемент, к которому привязана позиция overlay. */
    anchorElement: MaybeRefOrGetter<HTMLElement | null>;
    /** Смещение курсора в момент открытия (от верхнего левого угла якоря). */
    cursorOffset: () => { x: number; y: number } | null;
    /** При смене значения drag-смещение сбрасывается. */
    resetKey: () => unknown;
}
// #endregion

// #region useInlineEditingFallback
/**
 * Опции composable useInlineEditingFallback.
 */
export interface IInlineEditingFallbackOptions {
    /** Вызывается при переключении редактируемого свойства (сброс toolbar state). */
    onPropSwitch?: () => void;
}
// #endregion

// #region useCanvasContainerMetrics
/**
 * Опции composable useCanvasContainerMetrics.
 */
export interface ICanvasContainerMetricsOptions {
    /** Корневой контейнер контента канваса (data-root-drop-zone). */
    containerRef: Ref<HTMLElement | null>;
    /** Планировщик горизонтального центрирования канваса. */
    scheduleCanvasCenter: (behavior?: ScrollBehavior) => void;
    /** Скролл до выбранного компонента после смены viewport / выхода из Figma mode. */
    scrollToSelected: () => void;
}
// #endregion
