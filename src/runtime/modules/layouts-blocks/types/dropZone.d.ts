/**
 * Типы общей drag&drop-логики layout-блоков (composables/useLayoutDropZone).
 */

import type { MaybeRefOrGetter, Ref } from 'vue';

/**
 * Detail кастомного события `layout-drop`.
 * Читается канвасом (builder/canvas → ILayoutDropDetail) — поля должны совпадать.
 */
export interface ILayoutDropZoneDetail {
    layoutId?: string;
    movedComponentId: string | null;
    targetIndex: number | null;
    [extra: string]: unknown;
}

export interface ILayoutDropZoneOptions {
    /** Корневой элемент drop-зоны — источник bubbling-события `layout-drop` */
    containerRef: Ref<HTMLElement | null>;

    /** ID layout-компонента (component.id из схемы) */
    layoutId: MaybeRefOrGetter<string | undefined>;

    /** Drop-зона активна (slider: только в режиме редактора). Дефолт — true */
    isEnabled?: MaybeRefOrGetter<boolean>;

    /** Считать вложенные dragenter/dragleave (зоны, где курсор проходит над детьми) */
    useDragDepth?: boolean;

    /** Перемещение курсора с payload (enter/over/drop) — пересчёт drop-индикатора */
    onDragMove?: (event: DragEvent) => void;

    /** Сброс специфичного состояния блока (drop-индикатор, флаг заполненности) */
    onReset?: () => void;

    /** Доп. проверка dragover (grid: ёмкость). false → dropEffect 'none', зона неактивна */
    canAcceptDragOver?: (event: DragEvent) => boolean;

    /** Доп. проверка перед dispatch (grid: ёмкость с учётом внутренних перемещений) */
    canAcceptDrop?: (event: DragEvent, movedComponentId: string | null) => boolean;

    /** Вычисляет targetIndex для события `layout-drop` */
    resolveDropIndex: (event: DragEvent) => number | null;

    /** Отменять drop, если resolveDropIndex() вернул null (grid) */
    requireDropIndex?: boolean;

    /** Доп. поля в detail события `layout-drop` (grid: `{ swap: true }`) */
    extraDropDetail?: Record<string, unknown>;
}

export interface ILayoutDropZone {
    isDragOver: Ref<boolean>;
    updateDropEffect: (event: DragEvent) => void;
    resetDropState: () => void;
    handleDragEnter: (event: DragEvent) => void;
    handleDragOver: (event: DragEvent) => void;
    handleDragLeave: (event: DragEvent) => void;
    handleDrop: (event: DragEvent) => void;
}
