import { defineStore } from 'pinia';
import type { LandingSchema } from '../../types/landing';
import { clampHistory } from '../../utils/landing';

interface ILandingHistoryState {
    history: LandingSchema[];
    historyIndex: number;
}

/**
 * Управляет стэком истории изменений канваса: хранит сериализованные схемы,
 * предоставляет undo/redo и очистку с ограничением на максимальный размер.
 */
export const useLandingHistoryStore = defineStore('landingHistory', {
    state: (): ILandingHistoryState => ({
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
         * Добавляет новую схему в историю, отрезая "будущее" (redo-ветку) и применяя лимиты.
         *
         * @param schema - Текущее состояние схемы, сериализованное в DTO.
         */
        capture(schema: LandingSchema) {
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
         * Возвращает предыдущую схему, если доступна, и сдвигает указатель истории назад.
         *
         * @returns Предыдущее состояние схемы или `null`, если ход невозможен.
         */
        undo(): LandingSchema | null {
            if (!this.canUndo) {
                return null;
            }

            this.historyIndex--;
            return this.history[this.historyIndex] ?? null;
        },

        /**
         * Возвращает следующую схему и сдвигает указатель вперёд.
         *
         * @returns Следующее состояние схемы или `null`, если redo недоступен.
         */
        redo(): LandingSchema | null {
            if (!this.canRedo) {
                return null;
            }

            this.historyIndex++;
            return this.history[this.historyIndex] ?? null;
        },

        /**
         * Полностью очищает историю и возвращает указатель в исходное состояние.
         */
        reset() {
            this.history = [];
            this.historyIndex = -1;
        },
    },
});
