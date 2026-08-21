// #region Imports
import type { JSONContent } from '@tiptap/core';
import type { IInlineContentSegment } from '../../common/types/content';
// #endregion

/**
 * Converts an array of inline-content segments into a TipTap JSONContent document.
 * Text segments become text nodes, a line-break closes the current paragraph and opens
 * the next one, image/svg become an inlineSegmentImage atom.
 *
 * @param segments - Array of inline-content segments.
 * @returns TipTap JSONContent document.
 */
export function segmentsToTiptapDoc(segments: IInlineContentSegment[]): JSONContent {
    if (!segments || segments.length === 0) {
        return {
            type: 'doc',
            content: [{ type: 'paragraph' }],
        };
    }

    const paragraphs: JSONContent[] = [];
    let currentInline: JSONContent[] = [];

    for (const segment of segments) {
        if (segment.kind === 'line-break') {
            paragraphs.push({
                type: 'paragraph',
                content: currentInline.length > 0 ? currentInline : undefined,
            });
            currentInline = [];
            continue;
        }

        if (segment.kind === 'text') {
            if (segment.text) {
                currentInline.push({
                    type: 'text',
                    text: segment.text,
                });
            }
            continue;
        }

        if (segment.kind === 'image' || segment.kind === 'svg') {
            currentInline.push({
                type: 'inlineSegmentImage',
                attrs: {
                    segmentId: segment.id,
                    src: segment.url || null,
                    alt: segment.alt || '',
                    kind: segment.kind,
                    width: segment.width || null,
                    height: segment.height || null,
                    svgContent: segment.svgContent || null,
                },
            });
        }
    }

    paragraphs.push({
        type: 'paragraph',
        content: currentInline.length > 0 ? currentInline : undefined,
    });

    return {
        type: 'doc',
        content: paragraphs,
    };
}

/**
 * Converts a TipTap JSONContent back into an array of inline-content segments.
 * Image/SVG nodes are restored from originalSegments by segmentId (round-trip safe).
 * Both a paragraph boundary and a hardBreak come back as a line-break segment.
 *
 * @param doc - TipTap JSONContent document.
 * @param originalSegments - Original segments the media data is restored from.
 * @returns Array of IInlineContentSegment.
 */
export function tiptapDocToSegments(
    doc: JSONContent,
    originalSegments: IInlineContentSegment[]
): IInlineContentSegment[] {
    if (!doc.content || doc.content.length === 0) {
        return [];
    }

    const originalMap = new Map<string, IInlineContentSegment>();
    for (const seg of originalSegments) {
        originalMap.set(seg.id, seg);
    }

    const result: IInlineContentSegment[] = [];
    let textIdCounter = 0;

    for (let i = 0; i < doc.content.length; i++) {
        const paragraph = doc.content[i];

        if (i > 0) {
            result.push({
                id: `lb-${Date.now()}-${i}`,
                kind: 'line-break',
            });
        }

        if (!paragraph.content) {
            continue;
        }

        for (const node of paragraph.content) {
            if (node.type === 'text' && node.text) {
                textIdCounter += 1;
                result.push({
                    id: `text-${Date.now()}-${textIdCounter}`,
                    kind: 'text',
                    text: node.text,
                });
                continue;
            }

            if (node.type === 'inlineSegmentImage' && node.attrs) {
                const segmentId = node.attrs.segmentId as string;
                const original = originalMap.get(segmentId);

                if (original) {
                    result.push({ ...original });
                } else {
                    result.push({
                        id: segmentId || `media-${Date.now()}-${textIdCounter}`,
                        kind: (node.attrs.kind as 'image' | 'svg') || 'image',
                        url: node.attrs.src as string | undefined,
                        alt: node.attrs.alt as string | undefined,
                        width: node.attrs.width as string | number | undefined,
                        height: node.attrs.height as string | number | undefined,
                        svgContent: node.attrs.svgContent as string | undefined,
                    });
                }
            }

            if (node.type === 'hardBreak') {
                result.push({
                    id: `lb-${Date.now()}-hb-${textIdCounter}`,
                    kind: 'line-break',
                });
            }
        }
    }

    return result;
}
