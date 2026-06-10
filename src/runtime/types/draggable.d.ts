/**
 * Типы для drag-and-drop функциональности
 */

/**
 * Данные о зоне сброса компонента
 */
export interface IDropZoneData {
    layoutDropZone: HTMLElement | null;
    slotDropZone: HTMLElement | null;
    dropLayoutId: string | null;
    isSelfDrop: boolean;
}

/**
 * Данные извлеченные из drop события
 */
export interface IDropEventData {
    movedComponentId: string | null;
    rootTargetIndex: number | null;
}

/**
 * Опции для обработки drop события
 */
export interface IDropOptions {
    rootTargetIndex?: number | null;
}
