/**
 * Edits of props write into the history through ONE shared waiting window.
 *
 * Each file of actions used to own a window of its own: an edit of a property and an
 * edit of `htmlId` made inside 300 ms produced two history entries instead of one, and
 * the ceiling itself lived as two literals in two files, free to part ways in silence.
 *
 * The scheduler has to belong to the store instance: a single module-level one would mix
 * different Pinia instances and different SSR requests, so one render would start
 * canceling the timer of another.
 */

// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Types
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';

// Stores
import { useComponentsStore } from '../../src/runtime/modules/builder/core/stores/components';
import { useHistoryStore } from '../../src/runtime/modules/builder/core/stores/history';
// #endregion

// #region Data
/** The ceiling from `core/stores/actions/historyDebounce.ts` */
const HISTORY_SAVE_DEBOUNCE_MS = 300;
// #endregion

// #region Helpers
/**
 * Canvas component with empty props.
 *
 * @param id - Id of the component.
 */
function buildComponent(id: string): IBricksComponent {
    return {
        id,
        type: 'layout',
        componentName: 'Grid',
        brickPath: 'layout/grid',
        zIndex: 1,
        props: {},
    };
}
// #endregion

describe('the waiting window of a history entry is shared by every edit of props', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('an edit of a prop and an edit of htmlId inside one window give one entry holding both', () => {
        setActivePinia(createPinia());
        const store = useComponentsStore();
        const historyStore = useHistoryStore();
        store.components = [buildComponent('c1')];

        store.updateComponentProp('c1', 'title', 'Hello');
        vi.advanceTimersByTime(HISTORY_SAVE_DEBOUNCE_MS / 2);
        store.setComponentHtmlId('c1', 'anchor');
        vi.advanceTimersByTime(HISTORY_SAVE_DEBOUNCE_MS);

        expect(historyStore.history).toHaveLength(1);
        expect(historyStore.history[0]?.components[0]).toMatchObject({
            htmlId: 'anchor',
            props: { title: 'Hello' },
        });
    });

    it('two Pinia instances schedule their entries independently of each other', () => {
        const piniaA = createPinia();
        const piniaB = createPinia();

        setActivePinia(piniaA);
        const storeA = useComponentsStore();
        const historyA = useHistoryStore();
        storeA.components = [buildComponent('a1')];

        setActivePinia(piniaB);
        const storeB = useComponentsStore();
        const historyB = useHistoryStore();
        storeB.components = [buildComponent('b1')];

        storeA.updateComponentProp('a1', 'title', 'A');
        storeB.updateComponentProp('b1', 'title', 'B');
        vi.advanceTimersByTime(HISTORY_SAVE_DEBOUNCE_MS);

        expect(historyA.history).toHaveLength(1);
        expect(historyB.history).toHaveLength(1);
    });
});
