// #region Imports
// Types
import type { ResizableNodeViewDirection } from '@tiptap/core';
import type { PluginKey } from '@tiptap/pm/state';
// #endregion

/**
 * Internal fields of ResizableNodeView — @tiptap/extension-image does not export the
 * type, so they are reached through the `getNodeViewInternals` normalization.
 */
export interface IResizableNodeViewInternals {
    dom?: HTMLElement;
    node?: { attrs?: { width?: unknown; height?: unknown } };
    element?: HTMLElement;
    applyInitialSize?: () => void;
}

/**
 * Options of the media plugins shared by the image and the video extensions.
 *
 * The plugin keys come from the extension rather than being built inside the factory
 * from the node name: a key built per call would be a new key every time, so the same
 * plugin could be plugged in twice without ProseMirror noticing, and nothing outside
 * the factory could reach the plugin by its key any more.
 */
export interface IResizableMediaPluginOptions {
    /** Name of the node type the plugins act upon ("image" or "video") */
    nodeName: string;
    /** Key of the plugin syncing float, vertical-align and the custom sizes into the DOM */
    floatSyncKey: PluginKey;
    /** Key of the plugin clearing the custom sizes on a drag-resize */
    customSizeClearKey: PluginKey;
}

/**
 * Options of the video extension. The shape of `resize` repeats the one of
 * @tiptap/extension-image: both node views are built around the same ResizableNodeView,
 * and the two extensions are configured side by side in the editor factory.
 */
export interface IResizableVideoOptions {
    resize:
        | {
              enabled: boolean;
              directions?: ResizableNodeViewDirection[];
              minWidth?: number;
              minHeight?: number;
              alwaysPreserveAspectRatio?: boolean;
          }
        | false;
}

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        video: {
            setVideo: (options: { src: string; width?: number; height?: number }) => ReturnType;
        };
    }
}
