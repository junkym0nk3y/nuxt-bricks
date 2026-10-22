// #region Imports
// Types
import type { TComponentDropTarget } from '../../../../common/types/componentDrop';
import type { TComponentPlacementDecision } from '../../../../common/types/componentPlacement';
import type { TComponentMoveDestination } from '../../../core/types/componentMove';
import type { TBricksDeviceKey } from '../../../../common/types/brick';

// Vue
import { provide, toValue, type MaybeRefOrGetter } from 'vue';

// Pinia
import { useCanvasStore } from '../../../core/stores/canvas';
import { useComponentsStore } from '../../../core/stores/components';

// Utils
import {
    evaluateComponentInsertion,
    evaluateComponentMove,
} from '../../../core/utils/componentMovePolicy';

// Constants
import { COMPONENT_DROP_GUARD_KEY } from '../../../../common/constants/injectionKeys';
// #endregion

/**
 * Publishes the rule of a permitted move to the drop zones of the layout blocks and of
 * the slots.
 *
 * The rule itself stays in the builder — `layouts-blocks` may not import it — so the zone
 * receives an answer instead of the rule: it asks before drawing an insertion point.
 * Without this the canvas promised places the store then refused, and the person released
 * the button over a highlighted gap and got nothing.
 *
 * The viewport is a parameter and not a read of the store: Figma mode draws every device
 * at once, and the cells of a Grid are counted for the viewport of THAT sheet. Taking the
 * active viewport of the store would judge the capacity of one sheet by the numbers of
 * another.
 *
 * @param viewport - Viewport of the sheet this provider covers.
 */
export function useCanvasDropGuard(viewport: MaybeRefOrGetter<TBricksDeviceKey>): void {
    const canvasStore = useCanvasStore();
    const componentsStore = useComponentsStore();

    /**
     * Translates the neutral destination of a zone into the query of the move rule.
     *
     * @param target - Destination as the zone knows it.
     * @returns Destination of the move.
     */
    function toMoveDestination(target: TComponentDropTarget): TComponentMoveDestination {
        if (target.kind === 'slot') {
            return { kind: 'slot', parentId: target.parentId, slotName: target.slotName };
        }

        return { kind: 'layout', parentId: target.parentId };
    }

    provide(COMPONENT_DROP_GUARD_KEY, {
        evaluateDrop(target: TComponentDropTarget): TComponentPlacementDecision {
            const sourceId = canvasStore.dragState.componentId;
            const destination = toMoveDestination(target);
            const viewportKey = toValue(viewport);

            // A block dragged in from the library is not in the schema yet, so there is no
            // source to judge — but the destination is judged all the same: an occupied
            // single slot, a full Grid and the depth of the schema refuse a new block just
            // as they refuse a moved one, and the store does exactly that on the drop
            if (canvasStore.dragState.source !== 'canvas' || !sourceId) {
                return evaluateComponentInsertion({
                    components: componentsStore.components,
                    destination,
                    viewport: viewportKey,
                });
            }

            return evaluateComponentMove({
                components: componentsStore.components,
                sourceId,
                destination,
                viewport: viewportKey,
            });
        },
    });
}
