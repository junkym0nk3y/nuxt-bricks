// #region Imports
import { Node, mergeAttributes } from '@tiptap/core';
// #endregion

const DEFAULT_MEDIA_SIZE = '2.4rem';

/**
 * Кастомный inline atom node для image/SVG сегментов в inline-content.
 * Read-only, не редактируемый и не удаляемый пользователем.
 * Показывает превью изображения или SVG внутри TipTap-редактора.
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
     * Vanilla NodeView для рендеринга SVG контента внутри TipTap-редактора.
     * Для image-сегментов используется стандартный renderHTML (NodeView не создаётся).
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

            // SVG: создаём span и вставляем SVG-контент как innerHTML
            const dom = document.createElement('span');
            dom.setAttribute('data-segment-id', node.attrs.segmentId || '');
            dom.setAttribute('data-kind', 'svg');
            dom.setAttribute('style', buildSvgStyle(w, h));
            dom.className = 'inline-segment-media';
            dom.contentEditable = 'false';
            dom.innerHTML = node.attrs.svgContent;

            return { dom };
        };
    },
});

/**
 * Строит CSS style string для SVG-контейнера (span).
 */
function buildSvgStyle(width: string | number, height: string | number): string {
    const w = typeof width === 'number' ? `${width}rem` : width;
    const h = typeof height === 'number' ? `${height}rem` : height;

    return `display: inline-flex; vertical-align: middle; width: ${w}; height: ${h}`;
}

/**
 * Строит CSS style string для img-элемента.
 */
function buildImgStyle(width: string | number, height: string | number): string {
    const w = typeof width === 'number' ? `${width}rem` : width;
    const h = typeof height === 'number' ? `${height}rem` : height;

    return `display: inline-block; vertical-align: middle; width: ${w}; height: ${h}`;
}
