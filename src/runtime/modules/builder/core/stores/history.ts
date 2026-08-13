import { defineStore } from 'pinia';
import type { IBricksSchema } from '../../../common/types/brick';
import { clampHistory } from '../utils/history';

interface IHistoryState {
    history: IBricksSchema[];
    historyIndex: number;
}

/**
 * Управляет стэком истории изменений канваса: хранит сериализованные схемы,
 * предоставляет undo/redo и очистку с ограничением на максимальный размер.
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
         * Добавляет новую схему в историю, отрезая "будущее" (redo-ветку) и применяя лимиты.
         *
         * @param schema - Текущее состояние схемы, сериализованное в DTO.
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
         * Возвращает предыдущую схему, если доступна, и сдвигает указатель истории назад.
         *
         * @returns Предыдущее состояние схемы или `null`, если ход невозможен.
         */
        undo(): IBricksSchema | null {
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
        redo(): IBricksSchema | null {
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

        /**
         * Перебирает сохранённую ветку истории, применяя преобразование к каждому снимку.
         *
         * Нужен разрушающим правкам топологии страницы — удалению устройства из
         * набора и возврату к набору проекта. Полный сброс истории там не годится:
         * подтверждение обещает удалить переопределения устройства и только их, а
         * заодно отняло бы возможность отменить прежние правки текста и структуры.
         *
         * Redo-хвост отбрасывается обязательно: очистка одних лишь пройденных
         * снимков позволила бы redo вернуть только что удалённые переопределения.
         *
         * @param transform - Преобразование снимка (чистка ключей устройства).
         */
        rebase(transform: (schema: IBricksSchema) => IBricksSchema) {
            if (this.historyIndex < this.history.length - 1) {
                this.history.splice(this.historyIndex + 1);
            }

            this.history = this.history.map((schema) => transform(schema));
        },
    },
});
