import { defineStore } from 'pinia';
import type { IBricksSchema } from '../../../common/types/brick';
import { clampHistory } from '../utils/history';

interface IHistoryState {
    history: IBricksSchema[];
    historyIndex: number;
}

/**
 * Owns the undo stack of the canvas: it keeps the serialized schemas, offers
 * undo/redo and a reset, and caps how many snapshots are held.
 */
export const useHistoryStore = defineStore('bricksHistory', {
    state: (): IHistoryState => ({
        history: [],
        historyIndex: -1,
    }),

    getters: {
        canUndo(state): boolean {
            return state.historyIndex > 0;
        },
        canRedo(state): boolean {
            return state.historyIndex < state.history.length - 1;
        },
    },

    actions: {
        /**
         * Pushes a schema onto the history, cutting off the "future" (the redo branch)
         * and applying the size cap.
         *
         * @param schema - Current state of the schema, serialized into a DTO.
         */
        capture(schema: IBricksSchema) {
            if (this.historyIndex < this.history.length - 1) {
                this.history.splice(this.historyIndex + 1);
            }

            this.history.push(schema);
            this.historyIndex++;

            const normalized = clampHistory(this.history, this.historyIndex);
            this.history = normalized.history;
            this.historyIndex = normalized.historyIndex;
        },

        /**
         * Returns the previous schema when there is one and steps the pointer back.
         *
         * @returns The previous state of the schema, or `null` when there is no move.
         */
        undo(): IBricksSchema | null {
            if (!this.canUndo) {
                return null;
            }

            this.historyIndex--;
            return this.history[this.historyIndex] ?? null;
        },

        /**
         * Returns the next schema and steps the pointer forward.
         *
         * @returns The next state of the schema, or `null` when redo is unavailable.
         */
        redo(): IBricksSchema | null {
            if (!this.canRedo) {
                return null;
            }

            this.historyIndex++;
            return this.history[this.historyIndex] ?? null;
        },

        /**
         * Empties the history and puts the pointer back where it started.
         */
        reset() {
            this.history = [];
            this.historyIndex = -1;
        },

        /**
         * Walks the stored branch of the history, applying a transform to every snapshot.
         *
         * Why a destructive edit of the device set rewrites the history instead of wiping
         * it is at `stripDeviceKeys`, its only caller.
         *
         * The redo tail has to be discarded here: cleaning only the snapshots already
         * walked would let redo bring the just-deleted overrides back.
         *
         * @param transform - Transform of a snapshot (dropping the device keys).
         */
        rebase(transform: (schema: IBricksSchema) => IBricksSchema) {
            if (this.historyIndex < this.history.length - 1) {
                this.history.splice(this.historyIndex + 1);
            }

            this.history = this.history.map((schema) => transform(schema));
        },
    },
});
