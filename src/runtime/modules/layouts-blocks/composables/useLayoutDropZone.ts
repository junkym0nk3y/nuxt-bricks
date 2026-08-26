// #region Imports
// Types
import type {
    ILayoutDropZone,
    ILayoutDropZoneDetail,
    ILayoutDropZoneOptions,
} from '../types/dropZone';

// Vue
import { inject, onBeforeUnmount, ref, toValue, watch } from 'vue';

// Utils
import { animateFlowPlaceholder, applyDropEffect } from '../../common/utils/dragAndDrop';
import { queryLayoutDropItems } from '../utils/linearDropPlacement';

// Constants
import {
    CANVAS_DRAG_ACTIVE_KEY,
    COMPONENT_DROP_GUARD_KEY,
} from '../../common/constants/injectionKeys';
// #endregion

/**
 * Dispatches the bubbling `layout-drop` event carrying the component insertion
 * details. Listened for at the canvas root (builder/canvas → handleLayoutDrop).
 *
 * @param el - Drop-zone element the event bubbles out of.
 * @param detail - Insertion parameters (layoutId, movedComponentId, targetIndex, …).
 */
function dispatchLayoutDrop(el: HTMLElement | null, detail: ILayoutDropZoneDetail): void {
    const layoutDropEvent = new CustomEvent('layout-drop', {
        detail,
        bubbles: true,
    });
    el?.dispatchEvent(layoutDropEvent);
}

/**
 * Guarantees a single flow placeholder on the canvas: removes every foreign layout
 * placeholder orphaned by an unreliable dragleave between zones.
 *
 * @param current - Placeholder of the active zone, the one to keep.
 */
function removeForeignDropPlaceholders(current: HTMLElement | null): void {
    if (typeof document === 'undefined') {
        return;
    }

    const placeholders = document.querySelectorAll<HTMLElement>(
        '[data-layout-drop-destination="true"]'
    );

    placeholders.forEach((node) => {
        if (node !== current) {
            node.remove();
        }
    });
}

/**
 * Drag&drop logic shared by the layout blocks (Grid/Flex/Section/Slider): dropEffect
 * by payload type, drag-over state, a guard against self-drop and dispatch of the
 * `layout-drop` event. Whatever is specific to a block
 * (grid capacity, the drop indicator) is plugged in through the option hooks.
 *
 * @param options - Zone configuration and hooks for the block specifics.
 */
export function useLayoutDropZone(options: ILayoutDropZoneOptions): ILayoutDropZone {
    // #region Data
    const isDragOver = ref(false);

    let dropPlaceholder: HTMLElement | null = null;
    let activeDropContainer: HTMLElement | null = null;

    /** Last applied insertion index: for out-of-flow zones the DOM position never changes */
    let placeholderTargetIndex: number | null = null;
    const isCanvasDragActive = inject(CANVAS_DRAG_ACTIVE_KEY, ref(false));
    const dropGuard = inject(COMPONENT_DROP_GUARD_KEY, null);
    // #endregion

    // #region Methods
    /**
     * Checks whether the drop zone is active (slider: in editor mode only).
     */
    function isEnabled(): boolean {
        return toValue(options.isEnabled) ?? true;
    }

    /**
     * Whether the surface that owns the schema would carry out a move into this zone.
     *
     * Asked before the highlight and the placeholder: the rule of a permitted move (a
     * cycle, an ancestor into its own descendant, the depth of the schema, the capacity of
     * a Grid or a slot) lives in the builder, and the zone used to know only about a drop
     * onto itself. So the canvas showed a place, the store refused the move, and the drop
     * did nothing without saying why.
     *
     * Without a guard — a published page, where nothing is moved — everything is allowed.
     *
     * @returns The move into this zone would go through.
     */
    function isDropPermitted(): boolean {
        const layoutId = toValue(options.layoutId);

        if (!dropGuard || !layoutId) {
            return true;
        }

        return dropGuard.canDrop({ kind: 'layout', parentId: layoutId });
    }

    /**
     * Removes the flow placeholder from the current drop zone.
     */
    function removeDropPlaceholder(): void {
        dropPlaceholder?.remove();
        dropPlaceholder = null;
        placeholderTargetIndex = null;
    }

    /**
     * Marks the single active layout drop zone for a light highlight. Highlighting is
     * the whole of what a container block draws: the hover and selection ring around a
     * canvas item comes from BuilderCanvasItem, so a block only tints its own border and
     * background — when a block drew a ring of its own, the canvas ended up with two
     * rings of different thickness.
     *
     * @param container - Current container, or null on reset.
     */
    function setActiveDropContainer(container: HTMLElement | null): void {
        // Re-marking the same container would remove and put the attribute back on
        // every dragover — the zone highlight would blink for the whole length of its
        // own transition.
        if (container && activeDropContainer === container) {
            return;
        }

        activeDropContainer?.removeAttribute('data-layout-drop-active');
        activeDropContainer = container;

        if (!container) {
            return;
        }

        const activeContainers = document.querySelectorAll<HTMLElement>(
            '[data-layout-drop-active="true"]'
        );
        activeContainers.forEach((node) => {
            if (node !== container) {
                node.removeAttribute('data-layout-drop-active');
            }
        });
        container.dataset.layoutDropActive = 'true';
    }

    /**
     * Creates the flow placeholder with the CSS Modules class of the current layout
     * block.
     *
     * @returns Placeholder DOM element, or null when no visualization is configured.
     */
    function getDropPlaceholder(): HTMLElement | null {
        if (dropPlaceholder?.isConnected) {
            return dropPlaceholder;
        }

        if (!options.placeholderClass) {
            return null;
        }

        dropPlaceholder = document.createElement('div');
        dropPlaceholder.className = options.placeholderClass;
        dropPlaceholder.dataset.layoutDropDestination = 'true';
        dropPlaceholder.setAttribute('aria-hidden', 'true');
        return dropPlaceholder;
    }

    /**
     * Applies the zone geometry for the target index to the placeholder as inline
     * styles. Zones with no layout of their own (Flex/Section/Slider) stay on the flow
     * sizes that come from the class.
     *
     * @param placeholder - Placeholder element.
     * @param targetIndex - Index of the insertion point.
     */
    function applyPlaceholderStyle(placeholder: HTMLElement, targetIndex: number): void {
        const style = options.resolvePlaceholderStyle?.(targetIndex);
        if (!style) {
            return;
        }

        Object.entries(style).forEach(([property, value]) => {
            placeholder.style.setProperty(property, value);
        });
    }

    /**
     * Inserts the placeholder between the layout children at the computed targetIndex.
     *
     * @param event - Current drag event.
     */
    function syncDropPlaceholder(event: DragEvent): void {
        const container = options.resolvePlaceholderContainer?.() ?? options.containerRef.value;
        const placeholder = getDropPlaceholder();
        const targetIndex = options.resolveDropIndex(event);

        // The active zone claims the single placeholder, clearing out the ones orphaned
        // in other zones.
        removeForeignDropPlaceholders(placeholder);

        if (!container || !placeholder || targetIndex === null) {
            setActiveDropContainer(null);
            removeDropPlaceholder();
            return;
        }

        setActiveDropContainer(container);

        const children = options.resolvePlaceholderChildren?.() ?? queryLayoutDropItems(container);
        const referenceNode = children[targetIndex] ?? null;

        // The position has not changed — leave the node alone: insertBefore reconnects
        // the element even when it goes back into the same spot, and that resets its
        // animations on every dragover.
        if (
            placeholder.parentNode === container &&
            placeholder.nextElementSibling === referenceNode &&
            placeholderTargetIndex === targetIndex
        ) {
            return;
        }

        const previousRect = placeholder.isConnected ? placeholder.getBoundingClientRect() : null;

        container.insertBefore(placeholder, referenceNode);
        applyPlaceholderStyle(placeholder, targetIndex);
        placeholderTargetIndex = targetIndex;
        animateFlowPlaceholder(placeholder, previousRect);
    }

    /**
     * Fully resets the drag state of the zone (whatever is block-specific goes through
     * onReset).
     */
    function resetDropState(): void {
        isDragOver.value = false;
        setActiveDropContainer(null);
        removeDropPlaceholder();
        options.onReset?.();
    }

    /**
     * Handles the cursor entering the drop zone during a drag.
     * Without preventDefault on dragenter the browser may not treat the zone as valid.
     *
     * @param event - Current dragenter event.
     */
    function handleDragEnter(event: DragEvent): void {
        if (!isEnabled()) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();

        if (!applyDropEffect(event) || !isDropPermitted()) {
            resetDropState();
            return;
        }

        isDragOver.value = true;
        syncDropPlaceholder(event);
    }

    /**
     * Activates the drag-over state and allows a drop onto the zone.
     *
     * @param event - Browser dragover event.
     */
    function handleDragOver(event: DragEvent): void {
        if (!isEnabled()) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();

        const isAccepted =
            applyDropEffect(event) &&
            isDropPermitted() &&
            (options.canAcceptDragOver?.(event) ?? true);

        if (!isAccepted) {
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = 'none';
            }
            resetDropState();
            return;
        }

        isDragOver.value = true;
        syncDropPlaceholder(event);
    }

    /**
     * Resets the drag-over state when the cursor leaves the bounds of the zone.
     *
     * @param event - Browser dragleave event.
     */
    function handleDragLeave(event: DragEvent): void {
        if (!isEnabled()) {
            return;
        }
        event.stopPropagation();

        // The nesting check is the whole answer: `dragleave` on a move between children
        // carries a `relatedTarget` inside the container, and only a real exit carries one
        // outside it. A counter of enters used to stand next to this — and it never came
        // back to zero, because enters bubble from the children while these leaves return
        // early, so the first real exit left the zone highlighted until the end of the
        // drag session.
        //
        // A `null` target (the pointer left for another window) counts as a real exit: a
        // placeholder taken down a moment early beats one that sticks.
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && options.containerRef.value?.contains(nextTarget)) {
            return;
        }

        resetDropState();
    }

    /**
     * Handles the drop and dispatches `layout-drop` with the insertion details.
     *
     * @param event - Browser drop event.
     */
    function handleDrop(event: DragEvent): void {
        if (!isEnabled()) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();

        const movedComponentId = event.dataTransfer?.getData('component-id') || null;
        const layoutId = toValue(options.layoutId);

        // The self-drop check of the zone is gone: the guard covers it, and along with it
        // every other reason the store would refuse — one decision instead of three
        if (!isDropPermitted()) {
            resetDropState();
            return;
        }

        if (options.canAcceptDrop && !options.canAcceptDrop(event, movedComponentId)) {
            resetDropState();
            return;
        }

        const targetIndex = options.resolveDropIndex(event);

        if (targetIndex === null && options.requireDropIndex) {
            resetDropState();
            return;
        }

        dispatchLayoutDrop(options.containerRef.value, {
            layoutId,
            movedComponentId,
            targetIndex,
            ...options.extraDropDetail,
        });
        resetDropState();
    }

    /**
     * Resets the local state of every visited drop zone once the drag has finished.
     *
     * @param isActive - Global state of the native drag session.
     */
    function handleCanvasDragActiveChange(isActive: boolean): void {
        if (!isActive) {
            resetDropState();
        }
    }
    // #endregion

    // #region Lifecycle
    watch(isCanvasDragActive, handleCanvasDragActiveChange);
    onBeforeUnmount(resetDropState);
    // #endregion

    return {
        isDragOver,
        isCanvasDragActive,
        handleDragEnter,
        handleDragOver,
        handleDragLeave,
        handleDrop,
    };
}
