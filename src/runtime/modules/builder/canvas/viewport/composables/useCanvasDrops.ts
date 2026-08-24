// #region Imports
// Types
import type { IComponentSlotDefinition, TCanvasDragSource } from '../../../../common/types/brick';
import type { ICanvasDropsOptions, ILayoutDropDetail, ISlotDropDetail } from '../../types/canvas';

// Vue
import { computed, ref, watch } from 'vue';

// Pinia
import { useCanvasStore } from '../../../core/stores/canvas';

// Utils
import { applyDropEffect } from '../../../../common/utils/dragAndDrop';
import { suspendCanvasFlowTransitions } from '../../../core/utils/canvasFlow';
// #endregion

/**
 * Collects the whole drag and drop logic of the canvas root area in one place.
 *
 * @param options - Parameters the handlers need.
 */
export function useCanvasDrops({
    dragComposable,
    componentsStore,
    canvasRef,
    containerRef,
}: ICanvasDropsOptions) {
    const canvasStore = useCanvasStore();
    /**
     * Index of the upcoming insertion into the root: also the position of the flow
     * placeholder in the template.
     */
    const rootDropIndex = ref<number | null>(null);
    const rootDragDepth = ref(0);

    /**
     * Whether the upcoming root block lands inside `.bricks-container`: only
     * `fullWidth` turns the container off, so the insertion point has to repeat its
     * geometry (max-width plus the aside padding) instead of the full canvas width.
     *
     * A new block from the library is always created without `fullWidth`; an existing
     * one keeps its own value when moved to the root.
     */
    const isRootPlaceholderContained = computed<boolean>(() => {
        const { source, componentId } = canvasStore.dragState;

        if (source === 'canvas' && componentId) {
            return componentsStore.getComponentById(componentId)?.fullWidth !== true;
        }

        return true;
    });

    /**
     * Turns the flow shift animation off while the drop is applied.
     *
     * The placeholder has already opened the gap for the block, so FLIP on this patch
     * would draw the block "traveling" to a position it already occupies once the
     * cursor is released.
     */
    function commitFlowInstantly(): void {
        suspendCanvasFlowTransitions(canvasRef.value);
    }

    /**
     * Handles a drop on the canvas root area and hands the data to the drag composable.
     *
     * @param event - Native browser drop event.
     */
    function handleCanvasDrop(event: DragEvent): void {
        if (canvasRef.value && dragComposable?.handleDrop) {
            updateRootDropPlaceholder(event);
            commitFlowInstantly();

            dragComposable.handleDrop(event, canvasRef.value, componentsStore, {
                rootTargetIndex: rootDropIndex.value,
            });

            resetRootDropPlaceholder();
            // The drop session is over whether or not the zone accepted the payload:
            // without this the original spot stayed collapsed until `dragend`, which the
            // browser delivers a frame or two later — the block "came back" with a lag.
            finishDrag();
        }
    }

    /**
     * Delegates a dragover event to the active drag composable.
     *
     * @param event - Native dragover event.
     */
    function handleCanvasDragOver(event: DragEvent): void {
        dragComposable?.handleDragOver?.(event);
    }

    /**
     * Checks whether a drag event may be handled as a root-level one.
     *
     * @param event - Current drag event.
     * @returns Whether the event belongs to the root level.
     */
    function shouldHandleRootDrag(event: DragEvent): boolean {
        const container = containerRef.value;
        if (!container) {
            return false;
        }

        const target = event.target as HTMLElement | null;
        if (!target) {
            return false;
        }

        const layoutDropZone = target.closest('[data-layout-drop-zone="true"]');
        const slotDropZone = target.closest('[data-slot-drop-zone="true"]');
        if (slotDropZone) {
            return false;
        }
        if (layoutDropZone && layoutDropZone !== container) {
            return false;
        }

        return true;
    }

    /**
     * Resets the placeholder position and the drag event depth of the root.
     */
    function resetRootDropPlaceholder(): void {
        rootDropIndex.value = null;
        rootDragDepth.value = 0;
    }

    /**
     * Removes the transient root placeholder when a drag ends or is canceled.
     *
     * @param source - Current source of the drag session.
     */
    function handleDragSourceChange(source: TCanvasDragSource | null): void {
        if (source === null) {
            resetRootDropPlaceholder();
        }
    }

    watch(() => canvasStore.dragState.source, handleDragSourceChange, { flush: 'sync' });

    /**
     * Handles the cursor entering the root drop zone.
     *
     * @param event - Drag event of the pointer entering.
     */
    function handleRootDragEnter(event: DragEvent): void {
        if (!shouldHandleRootDrag(event)) {
            return;
        }

        event.preventDefault();
        rootDragDepth.value += 1;
        updateRootDropPlaceholder(event);
    }

    /**
     * Recomputes the indicator as the cursor moves inside the drop zone.
     *
     * @param event - Current dragover event.
     */
    function handleRootDragOver(event: DragEvent): void {
        if (!shouldHandleRootDrag(event)) {
            resetRootDropPlaceholder();
            return;
        }

        event.preventDefault();
        updateRootDropPlaceholder(event);
    }

    /**
     * Finishes handling the drop zone when the cursor leaves it.
     *
     * @param event - Drag event of the pointer leaving.
     */
    function handleRootDragLeave(event: DragEvent): void {
        if (!shouldHandleRootDrag(event)) {
            return;
        }

        event.preventDefault();
        rootDragDepth.value = Math.max(0, rootDragDepth.value - 1);
        if (rootDragDepth.value === 0) {
            resetRootDropPlaceholder();
        }
    }

    /**
     * Recomputes the insertion index of the root drop zone from the cursor position.
     *
     * @param event - Current dragover event.
     */
    function updateRootDropPlaceholder(event: DragEvent): void {
        const container = containerRef.value;
        if (!container) {
            return;
        }

        if (!shouldHandleRootDrag(event) || !applyDropEffect(event)) {
            resetRootDropPlaceholder();
            return;
        }

        const children = Array.from(
            container.querySelectorAll<HTMLElement>(':scope > [data-layout-drop-item="true"]')
        );
        const pointerY = event.clientY;
        const hoveredIndex = children.findIndex((child) => {
            const childRect = child.getBoundingClientRect();
            return pointerY < childRect.top + childRect.height / 2;
        });

        rootDropIndex.value = hoveredIndex === -1 ? children.length : hoveredIndex;
    }

    /**
     * Closes a successful drag session after the store mutation.
     */
    function finishDrag(): void {
        dragComposable?.endDrag();
        canvasStore.finishCanvasDrag();
    }

    /**
     * Handles the custom `layout-drop` event from child layout components.
     *
     * @param event - Event of the layout component.
     */
    function handleLayoutDrop(event: CustomEvent): void {
        resetRootDropPlaceholder();
        commitFlowInstantly();
        const detail = event.detail as ILayoutDropDetail;
        const { movedComponentId } = detail;

        if (detail.layoutId && movedComponentId && detail.layoutId === movedComponentId) {
            console.warn('[TheBuilderCanvas] Ignoring layout drop on self', detail);
            return;
        }

        if (movedComponentId) {
            moveExistingComponent(detail);
            finishDrag();
            return;
        }

        addComponentFromLibrary(detail);
        finishDrag();
    }

    /**
     * Moves an existing component into the given layout.
     *
     * @param layoutDropDetail - Move parameters.
     */
    function moveExistingComponent({
        layoutId,
        movedComponentId,
        gridColumn,
        gridRow,
        targetIndex,
        swap,
    }: ILayoutDropDetail): void {
        if (!movedComponentId) {
            return;
        }

        componentsStore.moveComponentToLayout(layoutId, movedComponentId, {
            targetIndex: typeof targetIndex === 'number' ? targetIndex : undefined,
            gridColumn,
            gridRow,
            swap,
        });
    }

    /**
     * Creates a new component from the library and inserts it into the chosen layout.
     *
     * @param layoutDropDetail - Insertion parameters.
     */
    function addComponentFromLibrary({
        layoutId,
        gridColumn,
        gridRow,
        targetIndex,
    }: ILayoutDropDetail): void {
        const draggedComponent = dragComposable?.draggedComponent?.value;

        if (!draggedComponent) {
            console.warn('[TheBuilderCanvas] No dragged component found', dragComposable);
            return;
        }

        const componentData = {
            componentName: draggedComponent.name,
            brickPath: draggedComponent.brickPath,
            width: 0,
            height: 0,
            gridColumn: gridColumn || undefined,
            gridRow: gridRow || undefined,
            props: JSON.parse(JSON.stringify(draggedComponent.defaultProps || {})),
            slots: Array.isArray(draggedComponent.slots)
                ? draggedComponent.slots.map((slot: IComponentSlotDefinition) => ({
                      name: slot.name,
                      label: slot.label,
                      description: slot.description,
                      allowMultiple: slot.allowMultiple,
                  }))
                : undefined,
        };

        const childId = componentsStore.addComponent(componentData);
        if (childId) {
            componentsStore.addChildToLayout(
                layoutId,
                childId,
                typeof targetIndex === 'number' ? targetIndex : undefined
            );
        }

        if (dragComposable?.draggedComponent) {
            dragComposable.draggedComponent.value = null;
        }
    }

    /**
     * Handles the custom `slot-drop` event from child slot zones.
     *
     * @param event - Event of the slot component.
     */
    function handleSlotDrop(event: CustomEvent): void {
        commitFlowInstantly();
        const detail = event.detail as ISlotDropDetail;
        const { parentId, slotName, movedComponentId, targetIndex } = detail || {};

        if (!parentId || !slotName) {
            console.warn('[TheBuilderCanvas] Invalid slot drop detail', detail);
            return;
        }

        if (movedComponentId) {
            componentsStore.moveComponentToSlot(
                parentId,
                slotName,
                movedComponentId,
                typeof targetIndex === 'number' ? targetIndex : undefined
            );
            finishDrag();
            return;
        }

        const draggedComponent = dragComposable?.draggedComponent?.value;
        if (!draggedComponent) {
            console.warn('[TheBuilderCanvas] Slot drop without dragged component metadata');
            return;
        }

        const componentData = {
            componentName: draggedComponent.name,
            brickPath: draggedComponent.brickPath,
            width: 0,
            height: 0,
            props: JSON.parse(JSON.stringify(draggedComponent.defaultProps || {})),
            slots: Array.isArray(draggedComponent.slots)
                ? draggedComponent.slots.map((slot: IComponentSlotDefinition) => ({
                      name: slot.name,
                      label: slot.label,
                      description: slot.description,
                      allowMultiple: slot.allowMultiple,
                  }))
                : undefined,
        };

        const childId = componentsStore.addComponent(componentData, { skipHistory: true });
        if (childId) {
            const result = componentsStore.moveComponentToSlot(
                parentId,
                slotName,
                childId,
                typeof targetIndex === 'number' ? targetIndex : undefined,
                { skipHistory: true }
            );

            if (result.moved) {
                componentsStore.saveToHistory();
            } else {
                // The component was created before the move and would stay at the
                // root level of the canvas — a block the user never asked for. The
                // removal goes without a history entry of its own: the history does
                // not deduplicate identical snapshots, and a pair of them would make
                // the first undo look like it did nothing
                componentsStore.removeComponent(childId, { skipHistory: true });
            }
        }

        if (dragComposable?.draggedComponent) {
            dragComposable.draggedComponent.value = null;
        }
        finishDrag();
    }

    return {
        rootDropIndex,
        isRootPlaceholderContained,
        handleRootDragEnter,
        handleRootDragOver,
        handleRootDragLeave,
        handleCanvasDrop,
        handleCanvasDragOver,
        handleLayoutDrop,
        handleSlotDrop,
    };
}
