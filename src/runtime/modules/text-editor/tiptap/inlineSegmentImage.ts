// #region Imports
import { Node, mergeAttributes } from '@tiptap/core';
import { sanitizeSvgMarkup } from '../../common/utils/sanitize/sanitizeSvg';
// #endregion

const DEFAULT_MEDIA_SIZE = '2.4rem';

/**
 * Custom inline atom node for the image/SVG segments of inline-content.
 * Read-only: `atom` plus `contenteditable=false` keep the insides out of editing,
 * `selectable: false` keeps the node out of a NodeSelection.
 * Shows a preview of the image or of the SVG inside the TipTap editor.
 *
 * Deletable, and on purpose: the standard Backspace chain of the editor removes the atom
 * like any other inline node, and no barrier is put in its way. A hidden keydown guard
 * would leave the segment in a document a person believes they have edited; taking a
 * picture out of a line of text is an ordinary edit, and the serialization of the segments
 * follows it. Making such a segment permanent would be a feature with an explicit way to
 * remove it, not a silent refusal of the key.
 */
export const InlineSegmentImage = Node.create({
    name: 'inlineSegmentImage',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: false,
    draggable: false,

    addAttributes() {
        return {
            segmentId: { default: null },
            src: { default: null },
            alt: { default: '' },
            kind: { default: 'image' },
            width: { default: null },
            height: { default: null },
            svgContent: { default: null },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'img[data-segment-id]',
            },
            {
                tag: 'span[data-segment-id][data-kind="svg"]',
                getAttrs: (element: HTMLElement) => ({
                    svgContent: element.innerHTML || null,
                }),
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        const w = HTMLAttributes.width || DEFAULT_MEDIA_SIZE;
        const h = HTMLAttributes.height || DEFAULT_MEDIA_SIZE;

        if (HTMLAttributes.kind === 'svg' && HTMLAttributes.svgContent) {
            return [
                'span',
                mergeAttributes(HTMLAttributes, {
                    'data-segment-id': HTMLAttributes.segmentId,
                    'data-kind': 'svg',
                    style: buildSvgStyle(w, h),
                    class: 'inline-segment-media',
                    contenteditable: 'false',
                }),
            ];
        }

        return [
            'img',
            mergeAttributes({
                'data-segment-id': HTMLAttributes.segmentId,
                'data-kind': HTMLAttributes.kind || 'image',
                src: HTMLAttributes.src,
                alt: HTMLAttributes.alt || '',
                style: buildImgStyle(w, h),
                class: 'inline-segment-media',
                contenteditable: 'false',
                draggable: 'false',
            }),
        ];
    },

    /**
     * Vanilla NodeView for both kinds of segment: an `img` element for an image, a
     * `span` with sanitized SVG markup for an SVG. renderHTML above stays the
     * serialization path (`getHTML`); what the editor shows is built here.
     */
    addNodeView() {
        return ({ node }) => {
            const isSvg = node.attrs.kind === 'svg' && node.attrs.svgContent;
            const w = node.attrs.width || DEFAULT_MEDIA_SIZE;
            const h = node.attrs.height || DEFAULT_MEDIA_SIZE;

            if (!isSvg) {
                const img = document.createElement('img');
                img.setAttribute('data-segment-id', node.attrs.segmentId || '');
                img.setAttribute('data-kind', node.attrs.kind || 'image');
                img.setAttribute('src', node.attrs.src || '');
                img.setAttribute('alt', node.attrs.alt || '');
                img.setAttribute('style', buildImgStyle(w, h));
                img.className = 'inline-segment-media';
                img.contentEditable = 'false';
                img.draggable = false;

                return { dom: img };
            }

            // SVG: build a span and put the SVG content in as innerHTML
            // (svgContent is untrusted input from the media library: sanitizer only)
            const dom = document.createElement('span');
            dom.setAttribute('data-segment-id', node.attrs.segmentId || '');
            dom.setAttribute('data-kind', 'svg');
            dom.setAttribute('style', buildSvgStyle(w, h));
            dom.className = 'inline-segment-media';
            dom.contentEditable = 'false';
            dom.innerHTML = sanitizeSvgMarkup(node.attrs.svgContent);

            return { dom };
        };
    },
});

/** Builds the CSS style string of the SVG container (span) */
function buildSvgStyle(width: string | number, height: string | number): string {
    const w = typeof width === 'number' ? `${width}rem` : width;
    const h = typeof height === 'number' ? `${height}rem` : height;

    return `display: inline-flex; vertical-align: middle; width: ${w}; height: ${h}`;
}

/** Builds the CSS style string of the img element */
function buildImgStyle(width: string | number, height: string | number): string {
    const w = typeof width === 'number' ? `${width}rem` : width;
    const h = typeof height === 'number' ? `${height}rem` : height;

    return `display: inline-block; vertical-align: middle; width: ${w}; height: ${h}`;
}
