/**
 * Telling the user why a move was refused.
 *
 * A missing drop indicator is enough of an answer while the cursor is still
 * moving, but not for a completed drop: the reasons are not obvious from the
 * screen — a block may be an ancestor of its own destination, the chain may be
 * about to exceed the nesting limit of the schema, a Grid may be out of cells.
 * Without a message such a drop reads as a broken interface.
 *
 * The programmer-level reasons (a missing id, a drop onto itself) are folded into
 * one common message: they say nothing to the user, and the details of them go
 * into the log of the store.
 */

// #region Imports
// Types
import type { TComponentPlacementRefusalReason } from '../../../common/types/componentPlacement';

// i18n
import { useI18n } from 'vue-i18n';

// Composables
import { useBuilderToast } from './useBuilderToast';
// #endregion

// #region Constants
/** Locale key per refusal reason. */
const REFUSAL_MESSAGE_KEYS: Record<TComponentPlacementRefusalReason, string> = {
    'source-not-found': 'bricks.schema.moveRefused.fallback',
    'target-not-found': 'bricks.schema.moveRefused.fallback',
    self: 'bricks.schema.moveRefused.fallback',
    descendant: 'bricks.schema.moveRefused.descendant',
    'invalid-graph': 'bricks.schema.moveRefused.invalidGraph',
    'target-not-container': 'bricks.schema.moveRefused.targetNotContainer',
    'slot-not-found': 'bricks.schema.moveRefused.fallback',
    'slot-capacity': 'bricks.schema.moveRefused.slotCapacity',
    'depth-limit': 'bricks.schema.moveRefused.depthLimit',
    'grid-capacity': 'bricks.schema.moveRefused.gridCapacity',
};
// #endregion

/**
 * Reports a refused move to the user.
 *
 * @returns The function that shows the refusal.
 */
export function useComponentMoveFeedback() {
    const { t } = useI18n();
    const { showToast } = useBuilderToast();

    // #region Methods
    /**
     * Shows the reason a move was refused.
     *
     * @param reason - Machine-readable reason from the move rule.
     */
    function reportRefusedMove(reason: TComponentPlacementRefusalReason): void {
        showToast(t(REFUSAL_MESSAGE_KEYS[reason]), 'error');
    }
    // #endregion

    return { reportRefusedMove };
}
