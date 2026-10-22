import type { IComponentsStore } from '../types';

// Utils
import { useDebounceFn } from '@vueuse/core';

/**
 * Waiting ceiling of a history entry: a fast run of value changes — the plus and minus
 * buttons of a stepper, typing into a field — must not serialize the schema dozens of
 * times.
 */
const HISTORY_SAVE_DEBOUNCE_MS = 300;

/**
 * One scheduler per store instance.
 *
 * A single module-level scheduler would be worse than the two it replaces: it would
 * mix different Pinia instances and different SSR requests, so one render would cancel
 * the timer of another. A field of the store is worse too — in an options store it
 * becomes part of the serialized state.
 */
const schedulers = new WeakMap<IComponentsStore, () => void>();

/**
 * Schedules a debounced history entry for the store.
 *
 * Every action that edits a prop shares the one window, so an edit of a property and an
 * edit of `htmlId` made inside it land in a single entry instead of two.
 *
 * @param store - Components store the entry is captured from.
 */
export function scheduleHistorySave(store: IComponentsStore): void {
    let schedule = schedulers.get(store);

    if (!schedule) {
        schedule = useDebounceFn(() => {
            store.saveToHistory();
        }, HISTORY_SAVE_DEBOUNCE_MS);
        schedulers.set(store, schedule);
    }

    schedule();
}
