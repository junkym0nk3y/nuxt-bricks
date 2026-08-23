// #region Imports
// Types
import type { IDropZoneData, IDropEventData, IDropOptions } from '../types/draggable';
import type {
    IBricksComponent,
    IComponentLibraryItem,
    IComponentSlotDefinition,
    IDragVisualSize,
} from '../../../common/types/brick';
import type { TBricksComponentsStore } from '../../core/stores/components';
import type { TComponentInsertPayload } from '../../core/stores/types';

// Vue
import { onBeforeUnmount, ref } from 'vue';

// Pinia
import { useCanvasStore } from '../../core/stores/canvas';

// Utils
import { setSkeletonDragImage } from '../../core/utils/dragVisuals';
// #endregion

/**
 * Dragging components out of the library onto the canvas.
 *
 * @returns The state and the methods of the drag-and-drop.
 */
export function useComponentLibraryDrag() {
    // #region Data
    const draggedComponent = ref<IComponentLibraryItem | null>(null);
    const canvasStore = useCanvasStore();
    // #endregion

    // #region Methods
    /**
     * Starts the drag of a component out of the library.
     *
     * @param component - The component being dragged.
     * @param event - The drag start event.
     * @param previewSize - The size of the future canvas placeholder.
     */
    function startDrag(
        component: IComponentLibraryItem,
        event: DragEvent,
        previewSize: IDragVisualSize
    ): void {
        draggedComponent.value = component;
        const sourceElement = event.currentTarget as HTMLElement | null;

        if (!event.dataTransfer || !sourceElement) {
            return;
        }

        canvasStore.startCanvasDrag({
            source: 'library',
            width: previewSize.width,
            height: previewSize.height,
            isFullWidth: previewSize.isFullWidth,
        });

        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('application/json', JSON.stringify(component));
        setSkeletonDragImage({
            event,
            sourceElement,
            variant: 'library',
            placeholderSize: previewSize,
        });
    }

    /**
     * Finishes a library drag and clears the transient state alone.
     */
    function endDrag(): void {
        draggedComponent.value = null;
        canvasStore.finishCanvasDrag();
    }

    /**
     * Takes the data out of a drop event.
     *
     * @param event - The drop event.
     * @param options - Options of handling the drop.
     * @returns The data taken out of the event.
     */
    function extractDropEventData(event: DragEvent, options?: IDropOptions): IDropEventData {
        const movedComponentId =
            event.dataTransfer?.getData('component-id') ||
            event.dataTransfer?.getData('text/plain') ||
            null;
        const rootTargetIndex =
            typeof options?.rootTargetIndex === 'number' ? options.rootTargetIndex : null;

        return { movedComponentId, rootTargetIndex };
    }

    /**
     * Determines the drop zones and checks for a self-drop.
     *
     * @param event - The drop event.
     * @param movedComponentId - The id of the component being moved.
     * @returns The drop zones the component was released over.
     */
    function analyzeDropZones(event: DragEvent, movedComponentId: string | null): IDropZoneData {
        const target = event.target as HTMLElement | null;

        const layoutDropZone = target?.closest('[data-layout-drop-zone="true"]') as
            | (HTMLElement & { dataset: DOMStringMap })
            | null;

        const slotDropZone = target?.closest('[data-slot-drop-zone="true"]') as
            | (HTMLElement & { dataset: DOMStringMap })
            | null;

        const dropLayoutId = layoutDropZone?.dataset?.layoutId || null;

        const isSelfDrop =
            Boolean(layoutDropZone) &&
            Boolean(dropLayoutId) &&
            Boolean(movedComponentId) &&
            dropLayoutId === movedComponentId;

        return { layoutDropZone, slotDropZone, dropLayoutId, isSelfDrop };
    }

    /**
     * Checks whether the handling of the drop is to be broken off.
     *
     * @param dropZoneData - The drop zones the component was released over.
     * @returns true when the handling is to be broken off.
     */
    function shouldAbortDrop(dropZoneData: IDropZoneData): boolean {
        // Broken off when released into a slot zone (handled separately)
        if (dropZoneData.slotDropZone) {
            return true;
        }

        // Broken off when released into a layout zone (handled by the layout
        // component)
        if (dropZoneData.layoutDropZone && !dropZoneData.isSelfDrop) {
            console.log('[useDraggableComponent] Dropped into layout, waiting for event...');
            return true;
        }

        // Broken off on a self-drop onto a layout
        if (dropZoneData.isSelfDrop) {
            console.log(
                '[useDraggableComponent] Ignoring self drop on layout:',
                dropZoneData.dropLayoutId
            );
            return true;
        }

        return false;
    }

    /**
     * Moves an existing component into the root.
     *
     * @param componentId - The id of the component being moved.
     * @param store - The store of the components.
     * @param rootTargetIndex - The target index in the root.
     */
    function moveExistingComponentToRoot(
        componentId: string,
        store: TBricksComponentsStore,
        rootTargetIndex: number | null
    ): void {
        console.log('[useDraggableComponent] Moving existing component:', componentId);

        const component = store.getComponentById(componentId);

        if (!component) {
            console.warn('[useDraggableComponent] Component not found in store:', componentId);
            return;
        }

        // moveComponentToRoot is used when it is available
        if (typeof store.moveComponentToRoot === 'function') {
            store.moveComponentToRoot(componentId, rootTargetIndex, { skipHistory: true });
            console.log(
                '[useDraggableComponent] Root components after move:',
                store.getRootComponents()?.map((rootComp: IBricksComponent) => rootComp?.id) || []
            );
        } else if (component.parent) {
            // The fallback: the removal out of the layout by hand
            store.removeChildFromLayout(component.parent, componentId, { skipHistory: true });
            component.parent = undefined;
        }

        // The grid positioning is dropped
        component.gridColumn = undefined;
        component.gridRow = undefined;

        // Recorded into the history
        if (typeof store.saveToHistory === 'function') {
            store.saveToHistory();
        }
    }

    /**
     * Builds the data of a component for adding it onto the canvas.
     *
     * @param draggedComp - The component being dragged out of the library.
     * @returns The data of the component for the store.
     */
    function createComponentData(draggedComp: IComponentLibraryItem): TComponentInsertPayload {
        return {
            componentName: draggedComp.name,
            brickPath: draggedComp.brickPath,
            props: JSON.parse(JSON.stringify(draggedComp.defaultProps || {})),
            isInteractive: draggedComp.isInteractive || undefined,
            slots: Array.isArray(draggedComp.slots)
                ? draggedComp.slots.map((slot: IComponentSlotDefinition) => ({
                      name: slot.name,
                      label: slot.label,
                      description: slot.description,
                      allowMultiple: slot.allowMultiple,
                  }))
                : undefined,
        };
    }

    /**
     * Adds a new component onto the canvas.
     *
     * @param store - The store of the components.
     * @param rootTargetIndex - The target index in the root.
     */
    function addNewComponentToCanvas(
        store: TBricksComponentsStore,
        rootTargetIndex: number | null
    ): void {
        if (!draggedComponent.value) {
            console.warn('[useDraggableComponent] No dragged component found');
            return;
        }

        const componentData = createComponentData(draggedComponent.value);

        // Whether the history has to be controlled by hand
        const shouldControlHistory =
            rootTargetIndex !== null && typeof store.moveComponentToRoot === 'function';

        const id = store.addComponent(
            componentData,
            shouldControlHistory ? { skipHistory: true } : undefined
        );
        console.log('[useDraggableComponent] Component added with id:', id);

        // Moved into the target position when an index is given
        if (id && rootTargetIndex !== null && typeof store.moveComponentToRoot === 'function') {
            store.moveComponentToRoot(id, rootTargetIndex, { skipHistory: true });
            if (typeof store.saveToHistory === 'function') {
                store.saveToHistory();
            }
        }
    }

    /**
     * Handles the drop event of a component onto the canvas.
     *
     * @param event - The drop event.
     * @param canvasEl - The canvas element.
     * @param store - The store of the components.
     * @param options - Options of handling the drop.
     */
    function handleDrop(
        event: DragEvent,
        canvasEl: HTMLElement,
        store: TBricksComponentsStore,
        options?: IDropOptions
    ): void {
        event.preventDefault();
        console.log('[useDraggableComponent] Drop event triggered', event);
        console.log('[useDraggableComponent] Dragged component:', draggedComponent.value);

        const { movedComponentId, rootTargetIndex } = extractDropEventData(event, options);
        const dropZoneData = analyzeDropZones(event, movedComponentId);

        if (shouldAbortDrop(dropZoneData)) {
            return;
        }

        if (movedComponentId) {
            moveExistingComponentToRoot(movedComponentId, store, rootTargetIndex);
            endDrag();
            return;
        }

        addNewComponentToCanvas(store, rootTargetIndex);
        endDrag();
    }

    /**
     * Handles the dragover event to set the right dropEffect.
     *
     * @param event - The dragover event.
     */
    function handleDragOver(event: DragEvent): void {
        event.preventDefault();
        if (event.dataTransfer) {
            if (event.dataTransfer.types.includes('component-id')) {
                event.dataTransfer.dropEffect = 'move';
            } else {
                event.dataTransfer.dropEffect = 'copy';
            }
        }
    }
    // #endregion

    // #region Lifecycle
    onBeforeUnmount(endDrag);
    // #endregion

    return {
        draggedComponent,
        startDrag,
        endDrag,
        handleDrop,
        handleDragOver,
    };
}
