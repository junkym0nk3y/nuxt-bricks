// #region Imports
import type { InjectionKey, Ref } from 'vue';
import type { TBricksDeviceKey } from '../types/brick';
import type { TBricksResolvedDeviceSet } from '../types/devices';
import type { IComponentDropGuard } from '../types/componentDrop';
import type { IInlineEditorHost } from '../types/inlineEditing';
// #endregion

/**
 * The active canvas viewport (reactive).
 * Provided by `TheBuilderCanvas` (the regular mode, out of the canvas store) and by
 * `BuilderCanvasViewport` (Figma mode, per viewport — the nearest provider wins).
 * On a published page there is no provider — the consumers use a fallback.
 */
export const CANVAS_VIEWPORT_KEY: InjectionKey<Ref<TBricksDeviceKey>> = Symbol('canvasViewport');

/**
 * The resolved device set of the current page (reactive).
 *
 * Provided by the builder page (out of the canvas store) and by the renderer page
 * (out of the page `viewportConfig`). Needed by the blocks for which CSS variables
 * are not enough — the Slider builds the Swiper JS breakpoints out of the set.
 * Without a provider the consumers take the project set.
 */
export const BRICKS_DEVICES_KEY: InjectionKey<Ref<TBricksResolvedDeviceSet>> =
    Symbol('bricksDevices');

/**
 * Whether a drag session is active on the canvas. The layout blocks use the signal
 * to hide the empty drop markers ("Drop components here") and to reset the local
 * drag state of a zone once the session ends. The helper grid (the toggle) stays
 * during a drag.
 */
export const CANVAS_DRAG_ACTIVE_KEY = Symbol.for('nuxt-bricks.canvasDragActive') as InjectionKey<
    Ref<boolean>
>;

/**
 * The guard of a drop zone: whether the surface that owns the schema would carry out the
 * move the zone is about to promise.
 *
 * Provided by the canvas (`useCanvasDropGuard`, one provider per viewport — the nearest
 * one wins, as with `CANVAS_VIEWPORT_KEY`). Without a provider — a published page — the
 * zones let everything through: there is nothing to move there.
 */
export const COMPONENT_DROP_GUARD_KEY: InjectionKey<IComponentDropGuard> =
    Symbol('componentDropGuard');

/**
 * The port of inline editing into the builder state (props + history).
 * Provided by `TheBuilderCanvas`; on a published page there is no provider —
 * without a host `useInlineEditor` does not initialize the editor.
 */
export const INLINE_EDITOR_HOST_KEY: InjectionKey<IInlineEditorHost> = Symbol('inlineEditorHost');

/**
 * Title of the open modal (reactive). Provided by `BricksModal` — with the very
 * value that goes into the hidden `DialogTitle`.
 *
 * Needed by `BricksModalHeader`: as long as the visible title was written in the
 * template by hand, it duplicated the `title` prop and could drift away from what a
 * screen reader announces, silently. A provide rather than a prop of the header, so
 * that the source stays a single one.
 */
export const BRICKS_MODAL_TITLE_KEY: InjectionKey<Ref<string>> = Symbol('bricksModalTitle');
