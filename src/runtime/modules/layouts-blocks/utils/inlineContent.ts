// #region Helpers
/**
 * Подготавливает SVG содержимое для inline-вставки.
 *
 * @param svgContent - Содержимое SVG файла.
 * @returns Очищенный SVG с обрезанными пробелами.
 */
function normalizeSvgContent(svgContent: string): string {
    return svgContent.trim();
}

/**
 * Применяет цвет к SVG контенту, заменяя fill/stroke на currentColor.
 *
 * @param svgContent - Исходное содержимое SVG.
 * @param color - Цвет текста, который нужно применить.
 * @returns SVG содержимое с подстановкой currentColor.
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
