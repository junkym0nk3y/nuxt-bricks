/**
 * Types of the drag-and-drop.
 */

/**
 * The drop zones a component was released over.
 */
export interface IDropZoneData {
    layoutDropZone: HTMLElement | null;
    slotDropZone: HTMLElement | null;
    dropLayoutId: string | null;
    isSelfDrop: boolean;
}

/**
 * The data taken out of a drop event.
 */
export interface IDropEventData {
    movedComponentId: string | null;
    rootTargetIndex: number | null;
}

/**
 * Options of handling a drop event.
 */
export interface IDropOptions {
    rootTargetIndex?: number | null;
}
