/**
 * Trims SVG content and, when a color is given, hands its fill/stroke to currentColor.
 *
 * `fill="none"` and `stroke="none"` are left alone: they say the shape is not painted,
 * and repainting them would fill an outline icon solid.
 *
 * @param svgContent - Original SVG content.
 * @param color - Text color to apply.
 * @returns Trimmed SVG content, with currentColor substituted in when asked.
 */
export function applyColorToSvgContent(svgContent: string, color?: string): string {
    if (!svgContent) {
        return svgContent;
    }

    let normalized = svgContent.trim();

    if (color) {
        const fillRegex = /fill="(?!none)[^"]*"/gi;
        const strokeRegex = /stroke="(?!none)[^"]*"/gi;

        normalized = normalized.replace(fillRegex, 'fill="currentColor"');
        normalized = normalized.replace(strokeRegex, 'stroke="currentColor"');

        if (!/fill="/i.test(normalized)) {
            normalized = normalized.replace('<svg', '<svg fill="currentColor"');
        }
    }

    return normalized;
}
