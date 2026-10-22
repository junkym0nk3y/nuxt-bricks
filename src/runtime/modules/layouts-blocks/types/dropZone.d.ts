/**
 * Types of the drag&drop logic shared by the layout blocks
 * (composables/useLayoutDropZone).
 */

import type { MaybeRefOrGetter, Ref } from 'vue';

/** Axis the children of a linear drop zone are laid out along */
export type TLayoutDropAxis = 'horizontal' | 'vertical';

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

/**
 * Configuration of the drop zone of a Grid block.
 *
 * The dimensions and the child count arrive as reactive sources rather than as numbers:
 * both have responsive overrides, and a Figma-mode board draws every viewport at once —
 * a value captured at setup would answer for the wrong viewport.
 *
 * Capacity is not among them: whether one more child fits is decided by the host out of
 * the schema and the viewport it draws. A count of its own here read the mounted DOM
 * nodes instead, and two counts of the same thing disagree — over a dangling child id,
 * over a schema mutation the DOM has not caught up with, over a payload the zone
 * classifies differently from the host.
 */
export interface IGridDropZoneOptions {
    /** Root element of the grid */
    containerRef: Ref<HTMLElement | null>;

    /** ID of the layout component (component.id from the schema) */
    layoutId: MaybeRefOrGetter<string | undefined>;

    /** Normalized number of columns on the current viewport */
    columns: MaybeRefOrGetter<number>;

    /** Normalized number of rows on the current viewport */
    rows: MaybeRefOrGetter<number>;

    /** How many children the slot actually paints — the ceiling of the placeholder cell */
    renderedChildCount: MaybeRefOrGetter<number>;

    /** CSS Modules class of the placeholder pinned to the target cell */
    placeholderClass?: string;
}
