// #region Imports
// Types
import type { NodeViewRendererProps } from '@tiptap/core';
import type { IResizableNodeViewInternals } from './types';

// TipTap
import Image from '@tiptap/extension-image';
import { PluginKey } from '@tiptap/pm/state';

// Utils
import { createResizableMediaAttributes, createResizableMediaPlugins } from './resizableMedia';
// #endregion

const floatSyncPluginKey = new PluginKey('resizableImageFloatSync');
const customSizeClearPluginKey = new PluginKey('resizableImageCustomSizeClear');
const DEFAULT_IMAGE_WIDTH = 300;

/**
 * Normalizes the result of the parent NodeView factory down to the internal fields.
 *
 * @param view - NodeView returned by the parent factory.
 * @returns Object with the optional internal fields of the NodeView.
 */
function getNodeViewInternals(view: unknown): IResizableNodeViewInternals {
    return (view ?? {}) as IResizableNodeViewInternals;
}

/**
 * The official Image extension, extended with float support (text wrapping) and with
 * the resize built into TipTap v3.
 *
 * Float rides on CSS classes (float-left, float-right, float-none).
 * ParseHTML understands both the new format (CSS classes) and the old one (the data-float
 * attribute). The parseHTML selector is `img[src]:not([data-segment-id])` to keep it from
 * clashing with InlineSegmentImage.
 *
 * The attributes of the wrapping and of the custom size, and the plugins syncing them into
 * the DOM, are shared with the video extension (`resizableMedia`).
 */
const ResizableImageBase = Image.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            ...createResizableMediaAttributes(),
            /**
             * Deferred loading of the images inside the text. The sanitizer has allowed
             * the attributes for a long time, but nobody was setting them: a long article
             * with a dozen images loaded all of them at once.
             *
             * The values are fixed rather than taken from the document: `parseHTML`
             * returns a constant, so HTML saved earlier gets them too the next time the
             * editor opens it.
             */
            loading: {
                default: 'lazy',
                parseHTML: () => 'lazy',
                renderHTML: () => ({ loading: 'lazy' }),
            },
            decoding: {
                default: 'async',
                parseHTML: () => 'async',
                renderHTML: () => ({ decoding: 'async' }),
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'img[src]:not([data-segment-id])',
            },
        ];
    },

    /**
     * addNodeView is overridden to work around a ResizableNodeView bug:
     * applyInitialSize() runs in the constructor BEFORE the image has loaded, so
     * initialWidth/Height are 0 and the aspectRatio is never computed.
     *
     * The fix: recompute the sizes once the img has loaded, and for new images with no
     * explicit width/height cap the width at DEFAULT_IMAGE_WIDTH.
     */
    addNodeView() {
        const parentFactory = this.parent?.();

        if (!parentFactory) {
            return null;
        }

        return (props: NodeViewRendererProps) => {
            const nodeView = parentFactory(props);
            const internals = getNodeViewInternals(nodeView);
            const dom = internals.dom;

            // Fix: TipTap puts display:flex on the container, which stretches it to the
            // full width. Inline images need inline-flex so that the container hugs its
            // content and looks the same as the saved result does (a plain <img>).
            if (dom instanceof HTMLElement) {
                dom.style.display = 'inline-flex';
            }

            const img = dom?.querySelector('img');

            if (!img) {
                return nodeView;
            }

            // A new image with no explicit size is capped at the default width
            if (!internals.node?.attrs?.width && !internals.node?.attrs?.height) {
                img.addEventListener(
                    'load',
                    () => {
                        const naturalW = img.naturalWidth || DEFAULT_IMAGE_WIDTH;
                        const naturalH = img.naturalHeight || DEFAULT_IMAGE_WIDTH;
                        const aspectRatio = naturalW / naturalH;
                        const width = Math.min(naturalW, DEFAULT_IMAGE_WIDTH);
                        const height = Math.round(width / aspectRatio);

                        if (internals.element) {
                            internals.element.style.width = `${width}px`;
                            internals.element.style.height = `${height}px`;
                        }

                        internals.applyInitialSize?.();

                        // Persist the sizes into the ProseMirror node attrs, otherwise
                        // width/height would stay null on save (getHTML)
                        const pos = props.getPos();

                        if (typeof pos === 'number') {
                            const { state } = props.editor.view;
                            const node = state.doc.nodeAt(pos);

                            if (node && node.type.name === 'image') {
                                const tr = state.tr.setNodeMarkup(pos, undefined, {
                                    ...node.attrs,
                                    width,
                                    height,
                                });

                                props.editor.view.dispatch(tr);
                            }
                        }
                    },
                    { once: true }
                );
            }

            return nodeView;
        };
    },

    addProseMirrorPlugins() {
        return createResizableMediaPlugins({
            nodeName: 'image',
            floatSyncKey: floatSyncPluginKey,
            customSizeClearKey: customSizeClearPluginKey,
        });
    },
});

export const ResizableImage = ResizableImageBase.configure({
    inline: true,
    resize: {
        enabled: true,
        directions: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
        minWidth: 40,
        minHeight: 40,
        alwaysPreserveAspectRatio: true,
    },
});
