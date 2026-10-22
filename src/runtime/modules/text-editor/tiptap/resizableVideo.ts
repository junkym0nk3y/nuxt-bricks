// #region Imports
// Types
import type { IResizableVideoOptions } from './types';

// TipTap
import { Node, mergeAttributes, ResizableNodeView } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';

// Utils
import { createResizableMediaAttributes, createResizableMediaPlugins } from './resizableMedia';
// #endregion

const floatSyncPluginKey = new PluginKey('resizableVideoFloatSync');
const customSizeClearPluginKey = new PluginKey('resizableVideoCustomSizeClear');
const DEFAULT_VIDEO_WIDTH = 480;

/**
 * TipTap Node extension that embeds a video with resize and float support.
 *
 * Uses ResizableNodeView from @tiptap/core directly (the same pattern the Image
 * extension follows). The attributes of the wrapping and of the custom size, and the
 * plugins syncing them into the DOM, are shared with the image extension
 * (`resizableMedia`).
 */
const ResizableVideoBase = Node.create<IResizableVideoOptions>({
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
            ...createResizableMediaAttributes(),
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

    addProseMirrorPlugins() {
        return createResizableMediaPlugins({
            nodeName: 'video',
            floatSyncKey: floatSyncPluginKey,
            customSizeClearKey: customSizeClearPluginKey,
        });
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
