// #region Imports
// Types
import type { Attributes } from '@tiptap/core';
import type { IResizableMediaPluginOptions } from './types';

// ProseMirror
import { Plugin } from '@tiptap/pm/state';
// #endregion

/**
 * Float, vertical-align and the custom size are written the same way for an image and for
 * a video: the same CSS classes, the same data attributes, the same pair of ProseMirror
 * plugins. The node views are not shared — an image extends @tiptap/extension-image while
 * a video builds a ResizableNodeView by hand — so what lives here is only the part that
 * does not depend on the element, parameterized by the name of the node type.
 */

const FLOAT_CLASSES = ['float-left', 'float-right', 'float-none'] as const;
const VALIGN_CLASSES = ['valign-baseline', 'valign-middle', 'valign-top', 'valign-bottom'] as const;

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
 * Attributes of the wrapping and of the custom size, shared by the media extensions.
 *
 * The four of them are returned as one block rather than one by one on purpose: an
 * extension cannot then be left with three of them, which is exactly the drift the shared
 * factory exists to prevent. The order inside the block does not reach the markup —
 * mergeAttributes collects `style` by CSS property, and the properties written here
 * (width, max-width, height) do not overlap.
 */
export function createResizableMediaAttributes(): Attributes {
    return {
        float: {
            default: null,
            parseHTML: (element: HTMLElement) => {
                if (element.classList.contains('float-left')) {
                    return 'left';
                }
                if (element.classList.contains('float-right')) {
                    return 'right';
                }
                // `float-none` is not what the interface writes — clearing the float
                // drops the attribute instead — but incoming markup carries it (the
                // code view keeps whatever was typed), and the class means something
                // of its own: `float: none` plus zero margins, unlike the absence of
                // the class. Without this branch an edit of such media silently
                // dropped the class and the picture regained the default margins
                if (element.classList.contains('float-none')) {
                    return 'none';
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
    };
}

/**
 * Plugin syncing the wrapping and the custom size of the media nodes into the DOM.
 * ResizableNodeView (TipTap v3) does not apply the renderHTML attributes to
 * data-resize-container, so the classes and the sizes are set by hand after every
 * transaction.
 */
function createFloatSyncPlugin(options: IResizableMediaPluginOptions): Plugin {
    const { nodeName, floatSyncKey } = options;

    return new Plugin({
        key: floatSyncKey,
        view() {
            return {
                update(view) {
                    view.state.doc.descendants((node, pos) => {
                        if (node.type.name !== nodeName) {
                            return;
                        }

                        const domNode = view.nodeDOM(pos);
                        if (!(domNode instanceof HTMLElement)) {
                            return;
                        }

                        // domNode is the data-resize-container (the NodeView root)
                        const container = domNode.hasAttribute('data-resize-container')
                            ? domNode
                            : domNode.closest<HTMLElement>('[data-resize-container]');

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

                        // Sync the custom sizes (rem, em, %) into the DOM container. With
                        // only one of them set, the other one follows the aspect ratio.
                        const cw = node.attrs.customWidth as string | null;
                        const ch = node.attrs.customHeight as string | null;

                        if (cw && ch) {
                            applyCustomDimension(container, 'width', cw);
                            applyCustomDimension(container, 'height', ch);
                        } else if (cw) {
                            applyCustomDimension(container, 'width', cw);
                            // offsetWidth gives the real pixels after layout (rem/em → px)
                            if (node.attrs.width && node.attrs.height) {
                                const ratio = node.attrs.width / node.attrs.height;
                                const actualW = container.offsetWidth;
                                if (actualW && ratio) {
                                    container.style.height = `${Math.round(actualW / ratio)}px`;
                                }
                            }
                        } else if (ch) {
                            applyCustomDimension(container, 'height', ch);
                            if (node.attrs.width && node.attrs.height) {
                                const ratio = node.attrs.width / node.attrs.height;
                                const actualH = container.offsetHeight;
                                if (actualH && ratio) {
                                    container.style.width = `${Math.round(actualH * ratio)}px`;
                                }
                            }
                        }
                    });
                },
            };
        },
    });
}

/**
 * Plugin clearing customWidth/customHeight on a drag-resize — a width/height change with
 * no `customSize` meta flag on the transaction. Without the flag check a size typed in
 * rem/em/% would be wiped by the very transaction that wrote it.
 */
function createCustomSizeClearPlugin(options: IResizableMediaPluginOptions): Plugin {
    const { nodeName, customSizeClearKey } = options;

    return new Plugin({
        key: customSizeClearKey,
        appendTransaction(transactions, oldState, newState) {
            if (transactions.some((tr) => tr.getMeta('customSize'))) {
                return null;
            }

            if (oldState.doc.eq(newState.doc)) {
                return null;
            }

            let clearTr: ReturnType<typeof newState.tr.setNodeMarkup> | null = null;

            newState.doc.descendants((newNode, pos) => {
                if (newNode.type.name !== nodeName) {
                    return;
                }

                if (!newNode.attrs.customWidth && !newNode.attrs.customHeight) {
                    return;
                }

                const oldNode = oldState.doc.nodeAt(pos);

                if (
                    !oldNode ||
                    oldNode.type.name !== nodeName ||
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
    });
}

/**
 * Both media plugins for one node type, in the order the extensions plug them in.
 */
export function createResizableMediaPlugins(options: IResizableMediaPluginOptions): Plugin[] {
    return [createFloatSyncPlugin(options), createCustomSizeClearPlugin(options)];
}
