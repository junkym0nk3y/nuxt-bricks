// #region Imports
// Types
import type { TCanvasDragSource } from '../../../../common/types/brick';
import type { ICanvasDropsOptions, ILayoutDropDetail, ISlotDropDetail } from '../../types/canvas';

// Vue
import { computed, ref, watch } from 'vue';

// Pinia
import { useCanvasStore } from '../../../core/stores/canvas';

// Composables
import { useComponentMoveFeedback } from '../../../core/composables/useComponentMoveFeedback';

// Utils
import { applyDropEffect } from '../../../../common/utils/dragAndDrop';
import {
    queryLayoutDropItems,
    resolveLinearDropIndex,
} from '../../../../layouts-blocks/utils/linearDropPlacement';
import { suspendCanvasFlowTransitions } from '../../../core/utils/canvasFlow';
import { buildComponentInsertPayload } from '../../../core/utils/componentInsertPayload';
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
    const { reportRefusedMove } = useComponentMoveFeedback();
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

            dragComposable.handleDrop(event, componentsStore, {
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

        rootDropIndex.value = resolveLinearDropIndex(event, 'vertical', () =>
            queryLayoutDropItems(container)
        );
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

        // The session is closed on every path, refusals included: an early return used to
        // rely on the native `dragend`, which arrives a frame or two later — and until it
        // did, the vacated spot of the block stayed collapsed
        try {
            if (movedComponentId) {
                moveExistingComponent(detail);
                return;
            }

            addComponentFromLibrary(detail);
        } finally {
            finishDrag();
        }
    }

    /**
     * Moves an existing component into the given layout.
     *
     * A refusal of the store is not swallowed: the drop zone asks the same rule before it
     * draws the insertion point, so a refusal here means the state changed between the
     * promise and the release of the button — and then the reason has to be said out loud,
     * exactly as the schema tree says it.
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

        const result = componentsStore.moveComponentToLayout(layoutId, movedComponentId, {
            targetIndex: typeof targetIndex === 'number' ? targetIndex : undefined,
            gridColumn,
            gridRow,
            swap,
        });

        if (!result.moved) {
            reportRefusedMove(result.reason);
        }
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

        const componentData = buildComponentInsertPayload(draggedComponent, {
            gridColumn,
            gridRow,
        });

        // The creation and the attachment are one step for the history and for the
        // schema: the store may refuse the attachment (the depth of the schema, a full
        // Grid), and a component created with a history entry of its own stayed at the
        // root level — a block nobody asked for, in a place nobody dropped it. The slot
        // branch below has always done this dance; this one had no rollback at all
        const childId = componentsStore.addComponent(componentData, { skipHistory: true });

        if (childId) {
            const result = componentsStore.addChildToLayout(
                layoutId,
                childId,
                typeof targetIndex === 'number' ? targetIndex : undefined,
                { skipHistory: true }
            );

            if (result.moved) {
                componentsStore.saveToHistory();
            } else {
                // Without a history entry of its own: the history does not deduplicate
                // identical snapshots, and a pair of them would make the first undo look
                // like it did nothing
                componentsStore.removeComponent(childId, { skipHistory: true });
                reportRefusedMove(result.reason);
            }
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
            const result = componentsStore.moveComponentToSlot(
                parentId,
                slotName,
                movedComponentId,
                typeof targetIndex === 'number' ? targetIndex : undefined
            );

            if (!result.moved) {
                reportRefusedMove(result.reason);
            }

            finishDrag();
            return;
        }

        const draggedComponent = dragComposable?.draggedComponent?.value;
        if (!draggedComponent) {
            console.warn('[TheBuilderCanvas] Slot drop without dragged component metadata');
            return;
        }

        const componentData = buildComponentInsertPayload(draggedComponent);

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
                reportRefusedMove(result.reason);
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
