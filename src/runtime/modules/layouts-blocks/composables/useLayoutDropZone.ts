// #region Imports
// Types
import type {
    TComponentPlacementDecision,
    TComponentPlacementRefusalReason,
} from '../../common/types/componentPlacement';
import type {
    ILayoutDropZone,
    ILayoutDropZoneDetail,
    ILayoutDropZoneOptions,
} from '../types/dropZone';

// Vue
import { inject, onBeforeUnmount, ref, toValue, watch } from 'vue';

// Utils
import {
    animateFlowPlaceholder,
    applyDropEffect,
    clearDropRefusalMarks,
} from '../../common/utils/dragAndDrop';
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
 * by payload type, drag-over state, the verdict of the host on the destination and
 * dispatch of the `layout-drop` event. Whatever is specific to a block (the geometry of
 * the drop indicator) is plugged in through the option hooks.
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
     * The verdict of the surface that owns the schema on a move into this zone.
     *
     * Asked before the highlight and the placeholder: the rule of a permitted move (a
     * cycle, an ancestor into its own descendant, the depth of the schema, the capacity of
     * a Grid or a slot) lives in the builder, and the zone used to know only about a drop
     * onto itself. So the canvas showed a place, the store refused the move, and the drop
     * did nothing without saying why.
     *
     * Recomputed on every event it is needed for, the drop included: the schema, the
     * responsive dimensions and the viewport all move during a drag, and a verdict kept
     * from the last dragover would let a drop into a target that has filled up since.
     *
     * Without a guard — a published page, where nothing is moved — everything is allowed.
     *
     * @returns Permission, or a refusal with a machine-readable reason.
     */
    function evaluateDropTarget(): TComponentPlacementDecision {
        const layoutId = toValue(options.layoutId);

        if (!dropGuard || !layoutId) {
            return { allowed: true };
        }

        return dropGuard.evaluateDrop({ kind: 'layout', parentId: layoutId });
    }

    /**
     * Marks this zone as the one that refused the drag, with the reason as the value.
     *
     * The mark lives on the element and not in a ref of the block, because a block is not
     * the only instance of itself: a Figma-mode board mounts one zone per viewport for the
     * same layout id, and a Grid full on mobile is not full on desktop. A block styles the
     * reasons it can explain — an out-of-cells Grid draws it red — and ignores the rest.
     *
     * @param reason - Why the host refused the move.
     */
    function markDropRefusal(reason: TComponentPlacementRefusalReason): void {
        clearDropRefusalMarks();
        const container = options.containerRef.value;

        if (!container) {
            return;
        }

        container.dataset.layoutDropRefusal = reason;
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
     * Takes down what the zone draws while it is prepared to accept the drag: the
     * highlight and the insertion point. The refusal mark is deliberately left alone —
     * a refused dragover clears these very visuals and then puts its own mark up, and a
     * single reset would erase it within the same event, which is why the red state of a
     * full Grid was never drawn at all.
     */
    function clearAcceptingVisuals(): void {
        isDragOver.value = false;
        setActiveDropContainer(null);
        removeDropPlaceholder();
    }

    /**
     * Fully resets the drag state of the zone: the accepting visuals plus the refusal.
     * Terminal — dragleave, drop, the end of the session, unmounting.
     */
    function resetDropState(): void {
        clearAcceptingVisuals();
        options.containerRef.value?.removeAttribute('data-layout-drop-refusal');
    }

    /**
     * Answers a drag held over the zone. `dragenter` and `dragover` are answered by one
     * and the same function on purpose: they used to differ — only dragover consulted the
     * block-specific check — and the first frame after the cursor entered promised a place
     * the very next event took back.
     *
     * Without preventDefault on dragenter the browser may not treat the zone as valid.
     *
     * @param event - Current dragenter or dragover event.
     */
    function handleDragTargeting(event: DragEvent): void {
        if (!isEnabled()) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();

        // A foreign payload — an OS file, a text selection — is not put to the host at
        // all: the guard answers about components. Its refusal has to come down with it,
        // or the zone would keep explaining a verdict it never asked for.
        if (!applyDropEffect(event)) {
            resetDropState();
            return;
        }

        const decision = evaluateDropTarget();

        if (!decision.allowed) {
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = 'none';
            }
            clearAcceptingVisuals();
            markDropRefusal(decision.reason);
            return;
        }

        clearDropRefusalMarks();
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
        // every other reason the store would refuse — one decision instead of three.
        //
        // The branch is narrower than it looks, and worth knowing before anything is hung
        // on it: a zone refused on hover sets dropEffect to none, and Chromium then does
        // not deliver the drop to it at all — measured, the same zone answering yes gets
        // the event and the same zone answering no gets nothing. What reaches here is a
        // verdict that changed during the drag, so a message to the user built on this
        // path would stay silent in the case it was written for.
        if (!evaluateDropTarget().allowed) {
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
        handleDragEnter: handleDragTargeting,
        handleDragOver: handleDragTargeting,
        handleDragLeave,
        handleDrop,
    };
}
