/**
 * Drag and drop of one row of the schema tree.
 *
 * A row has three landing zones instead of two: the edges put the block next to
 * the row as a sibling, the middle puts it INSIDE the row when the row is a
 * container. Without the middle one a block could not be put into an empty
 * container from the tree at all.
 *
 * The rule of a permitted move is asked before the indicator is drawn, and it is
 * the same rule the store applies (`evaluateComponentMove`). That is the point: a
 * row must not promise a drop the store would then refuse — that promise is
 * exactly what the tree used to give on every nested row.
 */

// #region Imports
// Types
import type { TComponentMoveDestination } from '../../../core/types/componentMove';
import type {
    ISidebarSchemaTreeDrop,
    ISidebarSchemaTreeDropOptions,
    TSchemaTreeDropPosition,
} from '../types/composables';

// Vue
import { ref } from 'vue';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';
import { useCanvasStore } from '../../../core/stores/canvas';

// Composables
import { useBuilderPermissions } from '../../../core/composables/useBuilderPermissions';

// Utils
import { evaluateComponentMove } from '../../../core/utils/componentMovePolicy';
import { getBlockDefinition } from '../../../../layouts-blocks/registry';
// #endregion

// #region Constants
/**
 * Share of the row height given to each edge zone. The middle half is left to
 * "inside": nesting is the harder gesture to aim, and a sibling drop has the
 * neighboring rows as its second chance.
 */
const EDGE_ZONE_RATIO = 0.25;

/** Key of the dragged row in the drag payload. */
const TREE_DRAG_PAYLOAD_KEY = 'tree-component-id';

/**
 * The row currently being dragged, shared by every row of the tree.
 *
 * At the module level and not inside the composable, because the row being
 * dragged and the row under the cursor are two different instances, while
 * `dragover` cannot read the payload of the drag — the browser hands the data
 * over on the drop only, and `dataTransfer.types` tells that this IS a tree drag
 * but not which row it carries. And the id is needed exactly during the hovering:
 * without it the rule of a permitted move has nothing to judge, and the row would
 * be back to promising a drop it cannot perform.
 *
 * Sharing between requests on the server is not a concern: the value is only ever
 * set by a `dragstart`, and there are no drag events there.
 */
const draggedComponentId = ref<string | null>(null);
// #endregion

/**
 * Wires the drag and drop of a tree row.
 *
 * @param options - The row and the callback that performs the move.
 * @returns The position of the indicator and the event handlers.
 */
export function useSidebarSchemaTreeDrop({
    component,
    onMove,
}: ISidebarSchemaTreeDropOptions): ISidebarSchemaTreeDrop {
    // #region Data
    const componentsStore = useComponentsStore();
    const canvasStore = useCanvasStore();
    // The tree stays navigation for every role, but moving blocks around with the
    // mouse is an edit of the schema
    const { canEdit } = useBuilderPermissions();
    const dropPosition = ref<TSchemaTreeDropPosition | null>(null);
    // #endregion

    // #region Methods
    /**
     * Whether the row accepts children of its own.
     *
     * @returns true for a container block.
     */
    function isContainerRow(): boolean {
        return getBlockDefinition(component.value.componentName)?.hasChildren === true;
    }

    /**
     * Ids of the siblings of the row — the list the row itself lies in.
     *
     * @returns Ids in their current order.
     */
    function getSiblingIds(): string[] {
        const parentId = component.value.parent;

        if (!parentId) {
            return componentsStore.getRootComponents().map((item) => item.id);
        }

        return componentsStore.getComponentById(parentId)?.children ?? [];
    }

    /**
     * Resolves the destination and the index for a landing position.
     *
     * @param position - Landing position relative to the row.
     * @returns The destination of the move and the insertion index.
     */
    function resolveDestination(position: TSchemaTreeDropPosition): {
        destination: TComponentMoveDestination;
        targetIndex: number;
    } {
        if (position === 'inside') {
            return {
                destination: { kind: 'layout', parentId: component.value.id },
                targetIndex: component.value.children?.length ?? 0,
            };
        }

        const siblings = getSiblingIds();
        const rowIndex = siblings.indexOf(component.value.id);
        // The index is counted in the list AS IT IS now; the correction for the
        // dragged row leaving its old place is made by the store actions
        // themselves, and doing it here as well would shift a downward move by one
        const targetIndex = Math.max(0, rowIndex) + (position === 'after' ? 1 : 0);
        const parentId = component.value.parent;

        return {
            destination: parentId ? { kind: 'layout', parentId } : { kind: 'root' },
            targetIndex,
        };
    }

    /**
     * Landing position by the cursor coordinates: the edges are siblings, the
     * middle of a container row is nesting.
     *
     * @param event - Drag event over the row.
     * @returns The position under the cursor.
     */
    function resolvePositionFromCursor(event: DragEvent): TSchemaTreeDropPosition {
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        const offset = event.clientY - rect.top;

        if (!isContainerRow()) {
            return offset < rect.height / 2 ? 'before' : 'after';
        }

        if (offset < rect.height * EDGE_ZONE_RATIO) {
            return 'before';
        }

        if (offset > rect.height * (1 - EDGE_ZONE_RATIO)) {
            return 'after';
        }

        return 'inside';
    }

    /**
     * Whether the move to the given position is permitted.
     *
     * @param sourceId - Row being dragged.
     * @param position - Landing position.
     * @returns true when the store would perform such a move.
     */
    function isMoveAllowed(sourceId: string, position: TSchemaTreeDropPosition): boolean {
        const { destination } = resolveDestination(position);

        return evaluateComponentMove({
            components: componentsStore.components,
            sourceId,
            destination,
            // The viewport is what makes the cells of a Grid countable: `rows` and
            // `columns` have responsive overrides
            viewport: canvasStore.viewport,
        }).allowed;
    }

    /**
     * Starts the drag of the row.
     *
     * @param event - The dragstart event.
     */
    function handleDragStart(event: DragEvent): void {
        if (!event.dataTransfer) {
            return;
        }

        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData(TREE_DRAG_PAYLOAD_KEY, component.value.id);
        draggedComponentId.value = component.value.id;
    }

    /**
     * Works out the landing position and shows the indicator, or refuses the drop.
     *
     * @param event - The dragover event.
     */
    function handleDragOver(event: DragEvent): void {
        event.stopPropagation();

        if (!canEdit.value || !event.dataTransfer) {
            return;
        }

        // A drag started outside the tree — a card of the library, a file — is not
        // a move of a row: the payload key is what tells them apart, and the id
        // itself comes from the remembered dragstart
        const sourceId = event.dataTransfer.types.includes(TREE_DRAG_PAYLOAD_KEY)
            ? draggedComponentId.value
            : null;

        if (!sourceId || sourceId === component.value.id) {
            dropPosition.value = null;

            return;
        }

        const position = resolvePositionFromCursor(event);

        if (!isMoveAllowed(sourceId, position)) {
            // Without preventDefault the browser refuses the drop itself and shows
            // the "not allowed" cursor — the row promises nothing it cannot do
            dropPosition.value = null;

            return;
        }

        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        dropPosition.value = position;
    }

    /**
     * Clears the indicator when the cursor leaves the row.
     */
    function handleDragLeave(): void {
        dropPosition.value = null;
    }

    /**
     * Ends the drag session: the row is no longer the source of anything.
     */
    function handleDragEnd(): void {
        draggedComponentId.value = null;
        dropPosition.value = null;
    }

    /**
     * Reports the resolved move upward.
     *
     * @param event - The drop event.
     */
    function handleDrop(event: DragEvent): void {
        event.preventDefault();
        event.stopPropagation();

        const position = dropPosition.value;
        const sourceId =
            event.dataTransfer?.getData(TREE_DRAG_PAYLOAD_KEY) || draggedComponentId.value;

        dropPosition.value = null;
        draggedComponentId.value = null;

        if (!position || !sourceId || sourceId === component.value.id) {
            return;
        }

        const { destination, targetIndex } = resolveDestination(position);

        onMove({ sourceId, destination, targetIndex });
    }
    // #endregion

    return {
        dropPosition,
        handleDragStart,
        handleDragOver,
        handleDragLeave,
        handleDragEnd,
        handleDrop,
    };
}
