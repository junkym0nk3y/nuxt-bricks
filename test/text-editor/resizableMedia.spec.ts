/**
 * @vitest-environment happy-dom
 *
 * Shared media semantics of the image and the video extensions.
 *
 * The two extensions used to carry their own copy of the wrapping attributes and of both
 * ProseMirror plugins, so a fix in one of them stayed unknown to the other. The spec
 * guards what the shared factories are for: the block of four attributes cannot lose one
 * of them, and the plugin acts on the node type it was built for rather than on `image`.
 */

// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// ProseMirror
import { Schema, type NodeSpec } from '@tiptap/pm/model';
import { EditorState, PluginKey } from '@tiptap/pm/state';
import { EditorView } from '@tiptap/pm/view';

// Utils
import {
    createResizableMediaAttributes,
    createResizableMediaPlugins,
} from '../../src/runtime/modules/text-editor/tiptap/resizableMedia';
// #endregion

/** Media node types the extensions build the shared plugins for. */
const MEDIA_NODES = ['image', 'video'] as const;

/**
 * Builds an element carrying the given markup of a media node.
 *
 * @param html - Markup of a single element.
 * @returns The parsed element.
 */
function elementFrom(html: string): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = html;
    return host.firstElementChild as HTMLElement;
}

/**
 * Builds a document schema with an atom node per media type and the shared attributes.
 *
 * @returns Schema whose inline nodes accept the wrapping and custom-size attributes.
 */
function createMediaSchema(): Schema {
    const attrs = Object.fromEntries(
        ['src', 'width', 'height', 'customWidth', 'customHeight', 'float', 'verticalAlign'].map(
            (name) => [name, { default: null }]
        )
    );
    // The resize container is what the real node views render around the media, and the
    // sync plugin looks the node up by that very attribute
    const media: NodeSpec = {
        inline: true,
        atom: true,
        group: 'inline',
        attrs,
        toDOM: () => ['div', { 'data-resize-container': '' }],
    };

    return new Schema({
        nodes: {
            doc: { content: 'paragraph+' },
            paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0] },
            text: { group: 'inline' },
            image: media,
            video: media,
        },
    });
}

/**
 * Builds a state holding one media node of the given type with a custom size set.
 *
 * @param nodeName - Type of the media node.
 * @returns The state and the position of the media node in it.
 */
function createStateWithMedia(nodeName: (typeof MEDIA_NODES)[number]): {
    state: EditorState;
    pos: number;
} {
    const schema = createMediaSchema();
    const media = schema.nodes[nodeName].create({
        src: 'https://example.test/media',
        width: 300,
        height: 150,
        customWidth: '30rem',
        customHeight: '15rem',
    });
    const doc = schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, media));

    return {
        state: EditorState.create({
            doc,
            plugins: createResizableMediaPlugins({
                nodeName,
                floatSyncKey: new PluginKey(`${nodeName}FloatSync`),
                customSizeClearKey: new PluginKey(`${nodeName}CustomSizeClear`),
            }),
        }),
        pos: 1,
    };
}

describe('createResizableMediaAttributes', () => {
    it('reads the float of the old markup and of the explicit float-none class', () => {
        const attributes = createResizableMediaAttributes();

        expect(attributes.float.parseHTML!(elementFrom('<img class="float-none">'))).toBe('none');
        expect(attributes.float.parseHTML!(elementFrom('<img data-float="left">'))).toBe('left');
        expect(attributes.float.parseHTML!(elementFrom('<img>'))).toBeNull();
    });

    it('takes a custom size with a unit out of the inline style and leaves px alone', () => {
        const attributes = createResizableMediaAttributes();

        expect(attributes.customWidth.parseHTML!(elementFrom('<img style="width: 30rem">'))).toBe(
            '30rem'
        );
        expect(attributes.customHeight.parseHTML!(elementFrom('<img style="height: 50%">'))).toBe(
            '50%'
        );
        expect(
            attributes.customWidth.parseHTML!(elementFrom('<img style="width: 300px">'))
        ).toBeNull();
    });

    it('renders both custom sizes, so neither of them can be missing from the block', () => {
        const attributes = createResizableMediaAttributes();

        expect(attributes.customWidth.renderHTML!({ customWidth: '30rem' })).toEqual({
            'data-custom-width': '30rem',
            style: 'width: 30rem; max-width: 100%',
        });
        expect(attributes.customHeight.renderHTML!({ customHeight: '15rem' })).toEqual({
            'data-custom-height': '15rem',
            style: 'height: 15rem',
        });
    });
});

describe.each(MEDIA_NODES)('custom size clearing of a %s', (nodeName) => {
    it('clears the custom size when the width changes without the customSize flag', () => {
        const { state, pos } = createStateWithMedia(nodeName);

        const next = state.apply(
            state.tr.setNodeMarkup(pos, undefined, {
                ...state.doc.nodeAt(pos)!.attrs,
                width: 400,
            })
        );

        expect(next.doc.nodeAt(pos)!.attrs.customWidth).toBeNull();
        expect(next.doc.nodeAt(pos)!.attrs.customHeight).toBeNull();
    });

    it('keeps the custom size when the transaction carries the customSize flag', () => {
        const { state, pos } = createStateWithMedia(nodeName);

        const next = state.apply(
            state.tr
                .setNodeMarkup(pos, undefined, {
                    ...state.doc.nodeAt(pos)!.attrs,
                    width: 400,
                })
                .setMeta('customSize', true)
        );

        expect(next.doc.nodeAt(pos)!.attrs.customWidth).toBe('30rem');
        expect(next.doc.nodeAt(pos)!.attrs.customHeight).toBe('15rem');
    });
});

describe.each(MEDIA_NODES)('syncing a %s into the DOM', (nodeName) => {
    it('writes the wrapping classes and the custom size onto the resize container', () => {
        const { state, pos } = createStateWithMedia(nodeName);
        const mount = document.createElement('div');
        document.body.append(mount);

        const view = new EditorView(mount, { state });

        // The plugin view updates on a state change, not on creation, and the custom-size
        // flag is what keeps the sizes from being cleared as a drag-resize
        view.dispatch(
            view.state.tr
                .setNodeMarkup(pos, undefined, {
                    ...view.state.doc.nodeAt(pos)!.attrs,
                    float: 'left',
                    verticalAlign: 'middle',
                })
                .setMeta('customSize', true)
        );

        const container = mount.querySelector<HTMLElement>('[data-resize-container]')!;

        expect(container.className).toBe('float-left valign-middle');
        expect(container.style.width).toBe('30rem');
        expect(container.style.height).toBe('15rem');

        view.destroy();
        mount.remove();
    });
});
