/**
 * Types of the drag&drop logic shared by the layout blocks
 * (composables/useLayoutDropZone).
 */

import type { MaybeRefOrGetter, Ref } from 'vue';

/**
 * Detail of the custom `layout-drop` event.
 * Read by the canvas (builder/canvas → ILayoutDropDetail) — the fields have to match.
 */
export interface ILayoutDropZoneDetail {
    layoutId?: string;
    movedComponentId: string | null;
    targetIndex: number | null;
    [extra: string]: unknown;
}

export interface ILayoutDropZoneOptions {
    /** Root element of the drop zone — the source of the bubbling `layout-drop` event */
    containerRef: Ref<HTMLElement | null>;

    /** ID of the layout component (component.id from the schema) */
    layoutId: MaybeRefOrGetter<string | undefined>;

    /** The drop zone is active (slider: in editor mode only). Defaults to true */
    isEnabled?: MaybeRefOrGetter<boolean>;

    /** Cursor movement carrying a payload (enter/over/drop) — recompute the drop indicator */
    onDragMove?: (event: DragEvent) => void;

    /** Reset of the block's own state (drop indicator, the is-full flag) */
    onReset?: () => void;

    /** Extra dragover check (grid: capacity). false → dropEffect 'none', zone inactive */
    canAcceptDragOver?: (event: DragEvent) => boolean;

    /** Extra check before the dispatch (grid: capacity, allowing for internal moves) */
    canAcceptDrop?: (event: DragEvent, movedComponentId: string | null) => boolean;

    /** Computes the targetIndex for the `layout-drop` event */
    resolveDropIndex: (event: DragEvent) => number | null;

    /** Cancel the drop when resolveDropIndex() returned null (grid) */
    requireDropIndex?: boolean;

    /** Extra fields in the detail of the `layout-drop` event (grid: `{ swap: true }`) */
    extraDropDetail?: Record<string, unknown>;

    /**
     * CSS Modules class of the flow placeholder that marks the insertion point. The
     * geometry comes from the class itself through the canvas variables
     * (`--bricks-drag-placeholder-*`); without the class no placeholder is drawn.
     */
    placeholderClass?: string;

    /** Inner flow container, when the placeholder is not inserted into the drop-zone root */
    resolvePlaceholderContainer?: () => HTMLElement | null;

    /** Elements between which the insertion point is reserved */
    resolvePlaceholderChildren?: () => HTMLElement[];

    /**
     * Inline styles of the placeholder for the target index (grid: an absolute binding
     * to the cell). Needed by zones with a fixed grid: an ordinary flow placeholder
     * would become one more grid item there and spawn an implicit row.
     * The keys are CSS properties in kebab-case (`grid-column`, not `gridColumn`).
     */
    resolvePlaceholderStyle?: (targetIndex: number) => Record<string, string> | null;
}

export interface ILayoutDropZone {
    isDragOver: Ref<boolean>;

    /** Whether the canvas drag session is active: blocks hide their empty drop markers */
    isCanvasDragActive: Ref<boolean>;
    handleDragEnter: (event: DragEvent) => void;
    handleDragOver: (event: DragEvent) => void;
    handleDragLeave: (event: DragEvent) => void;
    handleDrop: (event: DragEvent) => void;
}
