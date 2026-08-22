// #region Imports
// Types
import type { ISlotState, IUseSlotDragDropReturn } from '../../types/composables';

// Vue
import { inject, reactive, watch, type ComponentPublicInstance, type VNodeRef } from 'vue';

// Utils
import { applyDropEffect } from '../../../../common/utils/dragAndDrop';

// Constants
import { CANVAS_DRAG_ACTIVE_KEY } from '../../../../common/constants/injectionKeys';
// #endregion

/**
 * Drives the drag and drop behavior of slots: computes the insertion index, keeps the
 * drag-over state and dispatches `slot-drop`. The placeholder itself is rendered by the
 * template, at the index `getSlotDropIndex` reports.
 *
 * @param componentId - Id of the parent component
 * @returns Drag and drop handlers plus the state.
 */
export function useSlotDragDrop(componentId: string): IUseSlotDragDropReturn {
    // #region Data
    // Slot names come from the brick file: in a plain object `slotStates['__proto__']`
    // would read as an existing bucket, and the drag handlers would write
    // dragDepth/isDragOver/dropInsertIndex into `Object.prototype`
    const slotStates = reactive(new Map<string, ISlotState>());
    const slotContainerRefs = new Map<string, HTMLElement>();
    const isCanvasDragActive = inject(CANVAS_DRAG_ACTIVE_KEY, null);
    // #endregion

    // #region Methods
    /**
     * Position of the flow placeholder among the children of the slot (read by the
     * template).
     *
     * @param slotName - Slot name
     * @returns Index of the upcoming insertion, or null when the slot is not under the cursor.
     */
    function getSlotDropIndex(slotName: string): number | null {
        return slotStates.get(slotName)?.dropInsertIndex ?? null;
    }

    /**
     * Converts a Vue ref into an HTMLElement.
     * Handles both plain HTMLElements and ComponentPublicInstance refs.
     *
     * @param ref - Vue ref, either an element or a component instance
     * @returns HTMLElement or null
     */
    function resolveHTMLElement(ref: Element | ComponentPublicInstance | null): HTMLElement | null {
        if (!ref) {
            return null;
        }

        if (ref instanceof HTMLElement) {
            return ref;
        }

        const component = ref as ComponentPublicInstance;
        const el = component.$el;
        if (el instanceof HTMLElement) {
            return el;
        }

        return null;
    }

    /**
     * Makes sure the given slot has a state object
     *
     * @param slotName - Slot name
     * @returns State object of the slot
     */
    function ensureSlotState(slotName: string): ISlotState {
        const existing = slotStates.get(slotName);

        if (existing) {
            return existing;
        }

        slotStates.set(slotName, {
            dragDepth: 0,
            isDragOver: false,
            dropInsertIndex: null,
        });

        // Through get rather than through the literal just written: the reactive proxy is
        // what makes a mutation of dragDepth/isDragOver repaint the placeholder
        return slotStates.get(slotName) as ISlotState;
    }

    /**
     * Resets the state of a slot to its initial values
     *
     * @param slotName - Name of the slot to reset
     */
    function resetSlotState(slotName: string): void {
        const state = ensureSlotState(slotName);
        state.dragDepth = 0;
        state.isDragOver = false;
        state.dropInsertIndex = null;
    }

    /**
     * Builds the ref handler for the container element of a slot
     *
     * @param slotName - Slot name
     * @returns VNodeRef function to bind to a template ref
     */
    function setSlotContainerRef(slotName: string): VNodeRef {
        const refHandler: VNodeRef = (element) => {
            const htmlElement = resolveHTMLElement(
                (element as Element | ComponentPublicInstance | null) ?? null
            );
            if (htmlElement) {
                ensureSlotState(slotName);
                slotContainerRefs.set(slotName, htmlElement);
            } else {
                slotContainerRefs.delete(slotName);
            }
        };

        return refHandler;
    }

    /**
     * Collects every child element inside the container of a slot
     *
     * @param slotName - Slot name
     * @returns Array of child HTMLElements
     */
    function getSlotChildElements(slotName: string): HTMLElement[] {
        const container = slotContainerRefs.get(slotName);
        if (!container) {
            return [];
        }

        return Array.from(container.querySelectorAll<HTMLElement>('[data-slot-child="true"]'));
    }

    /**
     * Updates the index of the flow placeholder from the cursor position.
     *
     * @param slotName - Slot name
     * @param event - Drag event carrying the cursor position
     */
    function updateSlotDropTarget(slotName: string, event: DragEvent): void {
        const container = slotContainerRefs.get(slotName);
        if (!container) {
            return;
        }

        const state = ensureSlotState(slotName);
        const pointerY = event.clientY;
        const children = getSlotChildElements(slotName);
        const hoveredIndex = children.findIndex((child) => {
            const childRect = child.getBoundingClientRect();
            return pointerY < childRect.top + childRect.height / 2;
        });

        state.dropInsertIndex = hoveredIndex === -1 ? children.length : hoveredIndex;
    }

    /**
     * Dispatches the custom slot-drop event with the details of the drop
     *
     * @param slotName - Slot name
     * @param event - Drop event
     */
    function emitSlotDrop(slotName: string, event: DragEvent): void {
        const state = ensureSlotState(slotName);
        const container = slotContainerRefs.get(slotName);
        const movedComponentId =
            event.dataTransfer?.getData('component-id') ||
            event.dataTransfer?.getData('text/plain');

        const slotDropEvent = new CustomEvent('slot-drop', {
            detail: {
                parentId: componentId,
                slotName,
                movedComponentId: movedComponentId || null,
                targetIndex: state.dropInsertIndex ?? null,
            },
            bubbles: true,
        });

        container?.dispatchEvent(slotDropEvent);
    }

    /**
     * Handles a drag enter event of a slot
     *
     * @param slotName - Slot name
     * @param event - Drag enter event
     */
    function handleSlotDragEnter(slotName: string, event: DragEvent): void {
        event.preventDefault();
        event.stopPropagation();

        const state = ensureSlotState(slotName);
        state.dragDepth += 1;

        if (!applyDropEffect(event)) {
            resetSlotState(slotName);
            return;
        }

        state.isDragOver = true;
        updateSlotDropTarget(slotName, event);
    }

    /**
     * Handles a drag over event of a slot
     *
     * @param slotName - Slot name
     * @param event - Drag over event
     */
    function handleSlotDragOver(slotName: string, event: DragEvent): void {
        event.preventDefault();
        event.stopPropagation();

        if (!applyDropEffect(event)) {
            resetSlotState(slotName);
            return;
        }

        ensureSlotState(slotName).isDragOver = true;
        updateSlotDropTarget(slotName, event);
    }

    /**
     * Handles a drag leave event of a slot
     *
     * @param slotName - Slot name
     * @param event - Drag leave event
     */
    function handleSlotDragLeave(slotName: string, event: DragEvent): void {
        event.stopPropagation();

        const container = slotContainerRefs.get(slotName);
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && container?.contains(nextTarget)) {
            return;
        }

        const state = ensureSlotState(slotName);
        state.dragDepth = Math.max(0, state.dragDepth - 1);
        if (state.dragDepth > 0) {
            return;
        }

        resetSlotState(slotName);
    }

    /**
     * Handles a drop event of a slot
     *
     * @param slotName - Slot name
     * @param event - Drop event
     */
    function handleSlotDrop(slotName: string, event: DragEvent): void {
        event.preventDefault();
        event.stopPropagation();

        updateSlotDropTarget(slotName, event);
        emitSlotDrop(slotName, event);
        resetSlotState(slotName);
    }

    /**
     * Resets the transient state of every slot visited so far.
     */
    function resetAllSlotStates(): void {
        for (const slotName of Array.from(slotStates.keys())) {
            resetSlotState(slotName);
        }
    }

    /**
     * Removes the slot placeholders when a drag ends or is canceled.
     *
     * @param isActive - Whether the global canvas drag session is active.
     */
    function handleCanvasDragActiveChange(isActive: boolean): void {
        if (!isActive) {
            resetAllSlotStates();
        }
    }
    // #endregion

    // #region Lifecycle
    if (isCanvasDragActive) {
        watch(isCanvasDragActive, handleCanvasDragActiveChange, { flush: 'sync' });
    }
    // #endregion

    return {
        getSlotDropIndex,
        setSlotContainerRef,
        handleSlotDragEnter,
        handleSlotDragOver,
        handleSlotDragLeave,
        handleSlotDrop,
    };
}
