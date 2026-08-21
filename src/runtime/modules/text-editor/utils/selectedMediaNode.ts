// Types
import type { Editor } from '@tiptap/vue-3';

// ProseMirror
import { NodeSelection } from '@tiptap/pm/state';

/** Media node types supported by the float/size popover */
const SUPPORTED_MEDIA_NODES = ['image', 'video'] as const;

export interface ISelectedMediaNode {
    nodeName: (typeof SUPPORTED_MEDIA_NODES)[number];
    element: HTMLElement;
}

/**
 * Resolves the type and the DOM element of the selected media node (image or video).
 * Returns null when the selection is not a NodeSelection on a supported node.
 */
export function findSelectedMediaNode(editor: Editor): ISelectedMediaNode | null {
    const { state } = editor.view;
    const { selection } = state;

    if (!(selection instanceof NodeSelection)) {
        return null;
    }

    const nodeName = selection.node.type.name;

    if (!SUPPORTED_MEDIA_NODES.includes(nodeName as (typeof SUPPORTED_MEDIA_NODES)[number])) {
        return null;
    }

    const mediaNodeName = nodeName as (typeof SUPPORTED_MEDIA_NODES)[number];
    const domNode = editor.view.nodeDOM(selection.from);

    if (domNode instanceof HTMLImageElement || domNode instanceof HTMLVideoElement) {
        return { nodeName: mediaNodeName, element: domNode };
    }

    // ResizableNodeView: domNode is the container, look for the element inside it
    if (domNode instanceof HTMLElement) {
        const inner = domNode.querySelector<HTMLElement>(
            mediaNodeName === 'video' ? 'video' : 'img'
        );
        return inner ? { nodeName: mediaNodeName, element: inner } : null;
    }

    return null;
}
