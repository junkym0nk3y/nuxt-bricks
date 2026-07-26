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

    /**
     * CSS Modules class flow-плейсхолдера места вставки. Геометрию задаёт сам класс
     * через переменные канваса (`--bricks-drag-placeholder-*`); без класса
     * плейсхолдер не рисуется.
     */
    placeholderClass?: string;

    /** Внутренний flow-контейнер, если плейсхолдер вставляется не в корень drop-зоны. */
    resolvePlaceholderContainer?: () => HTMLElement | null;

    /** Элементы, между которыми резервируется место вставки. */
    resolvePlaceholderChildren?: () => HTMLElement[];

    /**
     * Inline-стили плейсхолдера для целевого индекса (grid: абсолютная привязка к
     * ячейке). Нужен зонам с фиксированной сеткой: обычный flow-плейсхолдер там
     * стал бы лишним grid-item и породил неявный ряд.
     * Ключи — CSS-свойства в kebab-case (`grid-column`, а не `gridColumn`).
     */
    resolvePlaceholderStyle?: (targetIndex: number) => Record<string, string> | null;
}

export interface ILayoutDropZone {
    isDragOver: Ref<boolean>;

    /** Активна ли drag-сессия канваса: блоки прячут пустые drop-маркеры. */
    isCanvasDragActive: Ref<boolean>;
    handleDragEnter: (event: DragEvent) => void;
    handleDragOver: (event: DragEvent) => void;
    handleDragLeave: (event: DragEvent) => void;
    handleDrop: (event: DragEvent) => void;
}
