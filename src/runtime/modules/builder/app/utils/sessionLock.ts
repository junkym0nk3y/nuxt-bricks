// #region Imports
// Types
import type { IBuilderSessionLockState } from '../types/builder';
// #endregion

/**
 * Whether the interface is closed while the session is inconsistent OR while the
 * loader is on the screen: the loader promises that work is not possible yet, and
 * the promise has to be true.
 *
 * The screen of a refused bootstrap is the exception here: it holds the only actions
 * left (the retry and the way onto the dashboard), and the toolbar next to it holds
 * the way out onto the dashboard as well. Both stay live, so this flag is the one
 * the toolbar and the transparent pointer blocker read.
 *
 * @param state - Error of the session, its readiness and the visibility of the loader.
 * @returns Whether the toolbar and the pointer are held.
 */
export function isBuilderInterfaceLocked(state: IBuilderSessionLockState): boolean {
    return !state.hasSessionError && (!state.isSessionReady || state.isLoaderVisible);
}

/**
 * The same for the working area, plus the error screen. The error screen covers the
 * area for the pointer alone (`position: absolute` over `.content`), so without this
 * the keyboard walked past it into the sidebar, the properties panel and the fields
 * of the publish form — where the autosave turns everything down by
 * `!isSessionReady`, and an edit is lost without a word.
 *
 * The rule is split off from the interface one rather than folded into it: the error
 * screen lies OUTSIDE `.workspace`, so `inert` here leaves its own buttons alive,
 * while the same value on the toolbar would take away the way out of an
 * inconsistent session.
 *
 * @param state - Error of the session, its readiness and the visibility of the loader.
 * @returns Whether the working area is taken away from the keyboard.
 */
export function isBuilderWorkspaceLocked(state: IBuilderSessionLockState): boolean {
    return state.hasSessionError || isBuilderInterfaceLocked(state);
}
