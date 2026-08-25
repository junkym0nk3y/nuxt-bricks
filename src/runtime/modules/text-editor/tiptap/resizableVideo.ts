// #region Imports
import { Node, mergeAttributes, ResizableNodeView } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
// #endregion

// #region Types
declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        video: {
            setVideo: (options: { src: string; width?: number; height?: number }) => ReturnType;
        };
    }
}
// #endregion

const FLOAT_CLASSES = ['float-left', 'float-right', 'float-none'] as const;
const VALIGN_CLASSES = ['valign-baseline', 'valign-middle', 'valign-top', 'valign-bottom'] as const;
const floatSyncPluginKey = new PluginKey('resizableVideoFloatSync');
const customSizeClearPluginKey = new PluginKey('resizableVideoCustomSizeClear');
const DEFAULT_VIDEO_WIDTH = 480;

/** Pulls a dimension carrying a unit (rem, em, %) out of the inline style of the element */
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
 * em values are converted into px against the computed font-size of the element.
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
 * TipTap Node extension that embeds a video with resize and float support.
 *
 * Uses ResizableNodeView from @tiptap/core directly (the same pattern the Image
 * extension follows). Float rides on CSS classes (float-left, float-right, float-none).
 * Vertical-align rides on CSS classes as well (valign-baseline, valign-middle,
 * valign-top, valign-bottom).
 */
const ResizableVideoBase = Node.create({
    name: 'video',

    inline: true,

    group: 'inline',

    atom: true,

    draggable: true,

    addAttributes() {
        return {
            src: {
                default: null,
                parseHTML: (element: HTMLElement) => element.getAttribute('src'),
            },
            width: {
                default: null,
                parseHTML: (element: HTMLElement) => {
                    const width = element.getAttribute('width');
                    return width ? Number(width) : null;
                },
                renderHTML: (attributes: Record<string, unknown>) => {
                    if (!attributes.width) {
                        return {};
                    }
                    return { width: attributes.width };
                },
            },
            height: {
                default: null,
                parseHTML: (element: HTMLElement) => {
                    const height = element.getAttribute('height');
                    return height ? Number(height) : null;
                },
                renderHTML: (attributes: Record<string, unknown>) => {
                    if (!attributes.height) {
                        return {};
                    }
                    return { height: attributes.height };
                },
            },
            float: {
                default: null,
                parseHTML: (element: HTMLElement) => {
                    if (element.classList.contains('float-left')) {
                        return 'left';
                    }
                    if (element.classList.contains('float-right')) {
                        return 'right';
                    }
                    // Read for the same reason as in the image extension: the interface
                    // clears a float by dropping the attribute, so `float-none` only ever
                    // arrives from outside — and it means `float: none` plus zero margins,
                    // which the absence of the class does not
                    if (element.classList.contains('float-none')) {
                        return 'none';
                    }
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
            autoplay: {
                default: true,
                parseHTML: (element: HTMLElement) => element.hasAttribute('autoplay'),
                renderHTML: (attributes: Record<string, unknown>) => {
                    if (!attributes.autoplay) {
                        return {};
                    }
                    return { autoplay: '' };
                },
            },
            loop: {
                default: true,
                parseHTML: (element: HTMLElement) => element.hasAttribute('loop'),
                renderHTML: (attributes: Record<string, unknown>) => {
                    if (!attributes.loop) {
                        return {};
                    }
                    return { loop: '' };
                },
            },
            muted: {
                default: true,
                parseHTML: (element: HTMLElement) => element.hasAttribute('muted'),
                renderHTML: (attributes: Record<string, unknown>) => {
                    if (!attributes.muted) {
                        return {};
                    }
                    return { muted: '' };
                },
            },
            playsinline: {
                default: true,
                parseHTML: (element: HTMLElement) => element.hasAttribute('playsinline'),
                renderHTML: (attributes: Record<string, unknown>) => {
                    if (!attributes.playsinline) {
                        return {};
                    }
                    return { playsinline: '' };
                },
            },
        };
    },

    parseHTML() {
        return [{ tag: 'video[src]' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['video', mergeAttributes(HTMLAttributes)];
    },

    addCommands() {
        return {
            setVideo:
                (options: { src: string; width?: number; height?: number }) =>
                ({ commands }) => {
                    return commands.insertContent({
                        type: this.name,
                        attrs: options,
                    });
                },
        };
    },

    /**
     * Builds a ResizableNodeView around a <video> element (the Image extension pattern).
     * For new videos with no explicit width/height the sizes are computed once
     * loadedmetadata has fired.
     */
    addNodeView() {
        if (
            !this.options.resize ||
            !this.options.resize.enabled ||
            typeof document === 'undefined'
        ) {
            return null;
        }

        const { directions, minWidth, minHeight, alwaysPreserveAspectRatio } = this.options.resize;

        return ({ node, getPos, HTMLAttributes, editor }) => {
            const el = document.createElement('video');

            Object.entries(HTMLAttributes).forEach(([key, value]) => {
                if (value !== null && value !== undefined) {
                    switch (key) {
                        case 'width':
                        case 'height':
                            break;
                        default:
                            el.setAttribute(key, String(value));
                            break;
                    }
                }
            });

            el.src = HTMLAttributes.src;

            // Browsers want the DOM properties, not just the attributes, for autoplay
            el.muted = true;
            el.autoplay = true;
            el.loop = true;
            el.playsInline = true;

            const nodeView = new ResizableNodeView({
                element: el,
                editor,
                node,
                getPos,
                onResize: (width, height) => {
                    el.style.width = `${width}px`;
                    el.style.height = `${height}px`;
                },
                onCommit: (width, height) => {
                    const pos = getPos();

                    if (pos === undefined) {
                        return;
                    }

                    editor
                        .chain()
                        .setNodeSelection(pos)
                        .updateAttributes(this.name, { width, height })
                        .run();
                },
                onUpdate: (updatedNode) => {
                    return updatedNode.type === node.type;
                },
                options: {
                    directions,
                    min: { width: minWidth, height: minHeight },
                    preserveAspectRatio: alwaysPreserveAspectRatio === true,
                },
            });

            const dom = nodeView.dom as HTMLElement;

            dom.style.display = 'inline-flex';

            // A new video with no explicit size is measured once its metadata loads
            if (!node.attrs.width && !node.attrs.height) {
                dom.style.visibility = 'hidden';

                el.addEventListener(
                    'loadedmetadata',
                    () => {
                        const naturalW = el.videoWidth || DEFAULT_VIDEO_WIDTH;
                        const naturalH = el.videoHeight || DEFAULT_VIDEO_WIDTH;
                        const aspectRatio = naturalW / naturalH;
                        const width = Math.min(naturalW, DEFAULT_VIDEO_WIDTH);
                        const height = Math.round(width / aspectRatio);

                        const pos = getPos();

                        if (typeof pos === 'number') {
                            editor
                                .chain()
                                .setNodeSelection(pos)
                                .updateAttributes(this.name, { width, height })
                                .run();
                        }

                        dom.style.visibility = '';
                    },
                    { once: true }
                );
            }

            return nodeView;
        };
    },

    /**
     * ProseMirror plugin that syncs float and verticalAlign into the DOM.
     * ResizableNodeView does not apply the renderHTML attributes to data-resize-container.
     */
    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: floatSyncPluginKey,
                view() {
                    return {
                        update(view) {
                            view.state.doc.descendants((node, pos) => {
                                if (node.type.name !== 'video') {
                                    return;
                                }

                                const domNode = view.nodeDOM(pos);
                                if (!(domNode instanceof HTMLElement)) {
                                    return;
                                }

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

                                const cw = node.attrs.customWidth as string | null;
                                const ch = node.attrs.customHeight as string | null;
                                const el = container as HTMLElement;

                                if (cw && ch) {
                                    applyCustomDimension(el, 'width', cw);
                                    applyCustomDimension(el, 'height', ch);
                                } else if (cw) {
                                    applyCustomDimension(el, 'width', cw);
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
                        if (newNode.type.name !== 'video') {
                            return;
                        }

                        if (!newNode.attrs.customWidth && !newNode.attrs.customHeight) {
                            return;
                        }

                        const oldNode = oldState.doc.nodeAt(pos);

                        if (
                            !oldNode ||
                            oldNode.type.name !== 'video' ||
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

export const ResizableVideo = ResizableVideoBase.configure({
    resize: {
        enabled: true,
        directions: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
        minWidth: 20,
        minHeight: 20,
        alwaysPreserveAspectRatio: true,
    },
});
