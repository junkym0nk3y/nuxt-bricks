// #region Helpers
/**
 * Prepares SVG content for inline insertion.
 *
 * @param svgContent - Contents of the SVG file.
 * @returns Cleaned SVG with the whitespace trimmed.
 */
function normalizeSvgContent(svgContent: string): string {
    return svgContent.trim();
}

/**
 * Applies a color to SVG content by replacing fill/stroke with currentColor.
 *
 * @param svgContent - Original SVG content.
 * @param color - Text color to apply.
 * @returns SVG content with currentColor substituted in.
 */
export function applyColorToSvgContent(svgContent: string, color?: string): string {
    if (!svgContent) {
        return svgContent;
    }

    let normalized = normalizeSvgContent(svgContent);

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
// #endregion
