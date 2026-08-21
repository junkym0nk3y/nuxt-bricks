// #region Imports
import type { NodeViewRendererProps } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import { Plugin, PluginKey } from '@tiptap/pm/state';
// #endregion

/**
 * Internal fields of ResizableNodeView — @tiptap/extension-image does not export the
 * type, so they are reached through the `getNodeViewInternals` normalization.
 */
interface IResizableNodeViewInternals {
    dom?: HTMLElement;
    node?: { attrs?: { width?: unknown; height?: unknown } };
    element?: HTMLElement;
    applyInitialSize?: () => void;
}

/**
 * Normalizes the result of the parent NodeView factory down to the internal fields.
 *
 * @param view - NodeView returned by the parent factory.
 * @returns Object with the optional internal fields of the NodeView.
 */
function getNodeViewInternals(view: unknown): IResizableNodeViewInternals {
    return (view ?? {}) as IResizableNodeViewInternals;
}

const FLOAT_CLASSES = ['float-left', 'float-right', 'float-none'] as const;
const VALIGN_CLASSES = ['valign-baseline', 'valign-middle', 'valign-top', 'valign-bottom'] as const;
const floatSyncPluginKey = new PluginKey('resizableImageFloatSync');
const customSizeClearPluginKey = new PluginKey('resizableImageCustomSizeClear');
const DEFAULT_IMAGE_WIDTH = 300;

/**
 * Pulls a dimension carrying a unit (rem, em, %) out of the inline style of the element.
 * Returns null for px values — those are handled by the regular width/height attributes.
 */
function extractStyledDimension(element: HTMLElement, prop: 'width' | 'height'): string | null {
    const style = element.getAttribute('style');
    if (!style) {
        return null;
    }

    const regex = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*(\\d+(?:\\.\\d+)?(?:rem|em|%))`, 'i');
    const match = style.match(regex);
    return match ? match[1] : null;
}

/**
 * Applies a custom size to the DOM element of the container.
 * em values are converted into px against the computed font-size of the element,
 * because the font-size context differs between the sidebar editor and the canvas.
 */
function applyCustomDimension(
    container: HTMLElement,
    prop: 'width' | 'height',
    value: string
): void {
    const emMatch = value.match(/^(\d+(?:\.\d+)?)em$/);

    if (emMatch) {
        const num = parseFloat(emMatch[1]);
        const computedFontSize = parseFloat(getComputedStyle(container).fontSize) || 16;
        container.style[prop] = `${num * computedFontSize}px`;
        return;
    }

    container.style[prop] = value;
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
 * Carries a ProseMirror plugin that syncs the float attribute into the DOM while editing,
 * because ResizableNodeView does not apply the renderHTML attributes to the DOM elements.
 */
const ResizableImageBase = Image.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            float: {
                default: null,
                parseHTML: (element: HTMLElement) => {
                    if (element.classList.contains('float-left')) {
                        return 'left';
                    }
                    if (element.classList.contains('float-right')) {
                        return 'right';
                    }

                    // Backward compat: the data-float attribute of the old format
                    return element.getAttribute('data-float') || null;
                },
                renderHTML: (attributes: Record<string, unknown>) => {
                    if (!attributes.float) {
                        return {};
                    }

                    return { class: `float-${attributes.float}` };
                },
            },
            verticalAlign: {
                default: null,
                parseHTML: (element: HTMLElement) => {
                    for (const cls of VALIGN_CLASSES) {
                        if (element.classList.contains(cls)) {
                            return cls.replace('valign-', '');
                        }
                    }
                    return null;
                },
                renderHTML: (attributes: Record<string, unknown>) => {
                    if (!attributes.verticalAlign) {
                        return {};
                    }
                    return { class: `valign-${attributes.verticalAlign}` };
                },
            },
            customWidth: {
                default: null,
                parseHTML: (element: HTMLElement) =>
                    element.getAttribute('data-custom-width') ||
                    extractStyledDimension(element, 'width'),
                renderHTML: (attributes: Record<string, unknown>) => {
                    if (!attributes.customWidth) {
                        return {};
                    }
                    return {
                        'data-custom-width': attributes.customWidth,
                        style: `width: ${attributes.customWidth}; max-width: 100%`,
                    };
                },
            },
            customHeight: {
                default: null,
                parseHTML: (element: HTMLElement) =>
                    element.getAttribute('data-custom-height') ||
                    extractStyledDimension(element, 'height'),
                renderHTML: (attributes: Record<string, unknown>) => {
                    if (!attributes.customHeight) {
                        return {};
                    }
                    return {
                        'data-custom-height': attributes.customHeight,
                        style: `height: ${attributes.customHeight}`,
                    };
                },
            },
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

    /**
     * ProseMirror plugin that syncs the float attribute of the image nodes into the DOM.
     * ResizableNodeView (TipTap v3) does not apply the renderHTML attributes to
     * data-resize-container, so the float class has to be set by hand after every
     * transaction.
     */
    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: floatSyncPluginKey,
                view() {
                    return {
                        update(view) {
                            view.state.doc.descendants((node, pos) => {
                                if (node.type.name !== 'image') {
                                    return;
                                }

                                const domNode = view.nodeDOM(pos);
                                if (!(domNode instanceof HTMLElement)) {
                                    return;
                                }

                                // domNode is the data-resize-container (the NodeView root)
                                const container = domNode.hasAttribute('data-resize-container')
                                    ? domNode
                                    : domNode.closest('[data-resize-container]');

                                if (!container) {
                                    return;
                                }

                                container.classList.remove(...FLOAT_CLASSES, ...VALIGN_CLASSES);

                                if (node.attrs.float) {
                                    container.classList.add(`float-${node.attrs.float}`);
                                }

                                if (node.attrs.verticalAlign) {
                                    container.classList.add(`valign-${node.attrs.verticalAlign}`);
                                }

                                // Sync the custom sizes (rem, em, %) into the DOM
                                // container. With only one of them set, the other one
                                // follows the aspect ratio.
                                const cw = node.attrs.customWidth as string | null;
                                const ch = node.attrs.customHeight as string | null;
                                const el = container as HTMLElement;

                                if (cw && ch) {
                                    applyCustomDimension(el, 'width', cw);
                                    applyCustomDimension(el, 'height', ch);
                                } else if (cw) {
                                    applyCustomDimension(el, 'width', cw);
                                    // offsetWidth gives the real pixels after layout (rem/em → px)
                                    if (node.attrs.width && node.attrs.height) {
                                        const ratio = node.attrs.width / node.attrs.height;
                                        const actualW = el.offsetWidth;
                                        if (actualW && ratio) {
                                            el.style.height = `${Math.round(actualW / ratio)}px`;
                                        }
                                    }
                                } else if (ch) {
                                    applyCustomDimension(el, 'height', ch);
                                    if (node.attrs.width && node.attrs.height) {
                                        const ratio = node.attrs.width / node.attrs.height;
                                        const actualH = el.offsetHeight;
                                        if (actualH && ratio) {
                                            el.style.width = `${Math.round(actualH * ratio)}px`;
                                        }
                                    }
                                }
                            });
                        },
                    };
                },
            }),
            // Clears customWidth/customHeight on a drag-resize (width/height change
            // with no meta flag)
            new Plugin({
                key: customSizeClearPluginKey,
                appendTransaction(transactions, oldState, newState) {
                    if (transactions.some((tr) => tr.getMeta('customSize'))) {
                        return null;
                    }

                    if (oldState.doc.eq(newState.doc)) {
                        return null;
                    }

                    let clearTr: ReturnType<typeof newState.tr.setNodeMarkup> | null = null;

                    newState.doc.descendants((newNode, pos) => {
                        if (newNode.type.name !== 'image') {
                            return;
                        }

                        if (!newNode.attrs.customWidth && !newNode.attrs.customHeight) {
                            return;
                        }

                        const oldNode = oldState.doc.nodeAt(pos);

                        if (
                            !oldNode ||
                            oldNode.type.name !== 'image' ||
                            oldNode.attrs.src !== newNode.attrs.src
                        ) {
                            return;
                        }

                        if (
                            newNode.attrs.width !== oldNode.attrs.width ||
                            newNode.attrs.height !== oldNode.attrs.height
                        ) {
                            if (!clearTr) {
                                clearTr = newState.tr;
                            }

                            clearTr.setNodeMarkup(pos, undefined, {
                                ...newNode.attrs,
                                customWidth: null,
                                customHeight: null,
                            });
                        }
                    });

                    return clearTr;
                },
            }),
        ];
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
