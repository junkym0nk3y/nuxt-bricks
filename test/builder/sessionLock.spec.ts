// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Types
import type { IBuilderSessionLockState } from '../../src/runtime/modules/builder/app/types/builder';

// Utils
import {
    isBuilderInterfaceLocked,
    isBuilderWorkspaceLocked,
} from '../../src/runtime/modules/builder/app/utils/sessionLock';
// #endregion

/**
 * The screen of a refused session covered the working area for the pointer alone:
 * Tab reached the sidebar and the properties panel behind it, where the autosave
 * turns everything down without a word. Hence two rules instead of one — and they
 * differ at exactly that state.
 */

/**
 * Builds a lock state out of a consistent session, changing the fields a case needs.
 *
 * @param overrides - What differs from a ready session with no loader on the screen.
 * @returns The state for the lock rules.
 */
function buildLockState(
    overrides: Partial<IBuilderSessionLockState> = {}
): IBuilderSessionLockState {
    return {
        hasSessionError: false,
        isSessionReady: true,
        isLoaderVisible: false,
        ...overrides,
    };
}

describe('builder lock: the interface and the working area', () => {
    it('keeps the toolbar and the pointer blocker live while the error screen is up', () => {
        const state = buildLockState({ hasSessionError: true, isSessionReady: false });

        // The toolbar holds the way onto the dashboard, and the error screen lies
        // outside `.workspace`, so its retry stays out of `inert`
        expect(isBuilderInterfaceLocked(state)).toBe(false);
        expect(isBuilderWorkspaceLocked(state)).toBe(true);
    });

    it('closes both while the session is inconsistent with no error of its own', () => {
        const state = buildLockState({ isSessionReady: false });

        expect(isBuilderInterfaceLocked(state)).toBe(true);
        expect(isBuilderWorkspaceLocked(state)).toBe(true);
    });

    it('holds the lock while the loader is on the screen, readiness or not', () => {
        const state = buildLockState({ isLoaderVisible: true });

        // A session opens faster than the animation of the loader runs out, and the
        // promise of the loader that work is not possible yet has to be true
        expect(isBuilderInterfaceLocked(state)).toBe(true);
        expect(isBuilderWorkspaceLocked(state)).toBe(true);
    });

    it('closes nothing in a consistent session with the loader gone', () => {
        const state = buildLockState();

        expect(isBuilderInterfaceLocked(state)).toBe(false);
        expect(isBuilderWorkspaceLocked(state)).toBe(false);
    });

    it('keeps the working area closed when the error arrives under a visible loader', () => {
        const state = buildLockState({
            hasSessionError: true,
            isSessionReady: false,
            isLoaderVisible: true,
        });

        expect(isBuilderWorkspaceLocked(state)).toBe(true);
    });
});
