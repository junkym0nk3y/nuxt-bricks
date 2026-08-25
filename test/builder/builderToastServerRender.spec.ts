/**
 * @vitest-environment node
 *
 * A toast raised while the page renders on the server.
 *
 * Two things used to go wrong there, and the second one is the reason the first
 * fix was not enough. The appearance animation is restarted through a frame, and
 * the server has none — an unguarded call threw, and because the dashboard reports
 * a failed media load right in its setup, the whole page answered 500 instead of
 * rendering. Showing the toast anyway would have been worse: the state is a module
 * singleton shared by every request of the worker, so the message of one render
 * would come back inside the HTML of the next one, addressed to somebody else.
 *
 * So a toast is not shown on the server at all, and the state stays untouched.
 *
 * The environment is `node` on purpose: `happy-dom` supplies
 * `requestAnimationFrame`, that is exactly the branch this spec must not take.
 */

// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';
// #endregion

// #region Mocks
vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));
// #endregion

import { useBuilderToast } from '../../src/runtime/modules/builder/core/composables/useBuilderToast';

describe('builder toast: a render without a frame', () => {
    it('reports a refusal without throwing and without touching the state', () => {
        expect(typeof globalThis.requestAnimationFrame).not.toBe('function');

        const { toast, showToast } = useBuilderToast();
        let token = 0;

        expect(() => {
            token = showToast('Media library is unavailable', 'error');
        }).not.toThrow();

        expect(token).toBe(-1);
        expect(toast.visible).toBe(false);
        expect(toast.message).toBe('');
        expect(toast.variant).toBe('success');
    });

    it('leaves nothing of one render inside the next one', () => {
        const firstRender = useBuilderToast();

        firstRender.showToast('Page of the first visitor could not be saved', 'error');

        // The second render is another request in the same worker: it shares the
        // module state with the first one, and must not inherit its message
        const secondRender = useBuilderToast();

        expect(secondRender.toast.message).toBe('');
        expect(secondRender.toast.visible).toBe(false);
        expect(secondRender.toast.actionLabel).toBe('');
        expect(secondRender.toast.onAction).toBeNull();
    });

    it('keeps the waiting toast silent too, action and all', () => {
        const { toast, showActionToast } = useBuilderToast();
        const onAction = vi.fn();

        const token = showActionToast({
            message: 'Restore the draft?',
            actionLabel: 'Restore',
            onAction,
        });

        expect(token).toBe(-1);
        expect(toast.visible).toBe(false);
        expect(toast.actionLabel).toBe('');
        expect(toast.onAction).toBeNull();
        expect(onAction).not.toHaveBeenCalled();
    });

    it('never hides somebody else`s toast by the token of one that was not shown', () => {
        const { toast, hideToast } = useBuilderToast();

        toast.visible = true;
        toast.token = 7;

        hideToast(-1);

        expect(toast.visible).toBe(true);

        toast.visible = false;
        toast.token = 0;
    });
});
