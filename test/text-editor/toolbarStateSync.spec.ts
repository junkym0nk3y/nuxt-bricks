/**
 * @vitest-environment happy-dom
 *
 * Refresh of the toolbar on an editor transaction.
 *
 * The buttons of the toolbar report their state through `isActive()`, which is not
 * reactive: moving the cursor within the same formatting changes neither the available
 * fonts nor the values in `toolbarState`, so nothing else in the computed would have
 * changed and the pressed buttons would have stayed as they were. The only thing that
 * invalidates the config is the revision bumped by every transaction — the spec guards
 * that the computed still reads it.
 */

// #region Imports
// Types
import type { Editor } from '@tiptap/vue-3';

// Vitest
import { describe, expect, it, vi } from 'vitest';
// #endregion

// #region Mocks
const { toolbar } = vi.hoisted(() => ({
    toolbar: {
        createToolbarConfig: vi.fn(() => []),
        syncToolbarState: vi.fn(),
    },
}));

vi.mock('nuxt/app', () => ({
    useNuxtApp: () => ({ $textEditorToolbar: toolbar }),
    useAppConfig: () => ({}),
}));
// #endregion

import { useToolbarStateSync } from '../../src/runtime/modules/text-editor/composables/useToolbarStateSync';

/** Editor stub: the composable only subscribes to the transactions of the editor. */
interface IEditorStub {
    handlers: (() => void)[];
    on: (event: string, handler: () => void) => void;
    off: (event: string, handler: () => void) => void;
}

/**
 * Builds an editor stub whose transaction handlers can be fired by hand.
 *
 * @returns The stub together with the handlers it has collected.
 */
function createEditorStub(): IEditorStub {
    const handlers: (() => void)[] = [];

    return {
        handlers,
        on: (event, handler) => {
            if (event === 'transaction') {
                handlers.push(handler);
            }
        },
        off: (event, handler) => {
            if (event !== 'transaction') {
                return;
            }

            const index = handlers.indexOf(handler);

            if (index >= 0) {
                handlers.splice(index, 1);
            }
        },
    };
}

describe('useToolbarStateSync', () => {
    it('rebuilds the config of the toolbar on a transaction that changes nothing else', () => {
        toolbar.createToolbarConfig.mockClear();

        const editor = createEditorStub();
        const { toolbarGroups } = useToolbarStateSync(editor as unknown as Editor);

        expect(toolbarGroups.value).toEqual([]);
        expect(toolbar.createToolbarConfig).toHaveBeenCalledTimes(1);

        editor.handlers.forEach((handler) => handler());

        expect(toolbarGroups.value).toEqual([]);
        expect(toolbar.createToolbarConfig).toHaveBeenCalledTimes(2);
    });
});
