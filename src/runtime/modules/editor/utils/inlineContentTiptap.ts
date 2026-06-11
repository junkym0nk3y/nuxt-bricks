// #region Imports
import type { JSONContent } from '@tiptap/core';
import type { IInlineContentSegment } from '../../layouts-blocks/types/layouts';
// #endregion

/**
 * Конвертирует массив inline-content сегментов в TipTap JSONContent (документ).
 * Text сегменты → text nodes, line-break → hardBreak, image/svg → inlineSegmentImage atom.
 *
 * @param segments - Массив сегментов inline-content.
 * @returns TipTap JSONContent документ.
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
 * Конвертирует TipTap JSONContent обратно в массив inline-content сегментов.
 * Image/SVG ноды восстанавливаются из originalSegments по segmentId (round-trip safe).
 *
 * @param doc - TipTap JSONContent документ.
 * @param originalSegments - Оригинальные сегменты для восстановления медиа-данных.
 * @returns Массив IInlineContentSegment.
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
