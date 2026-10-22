/**
 * Pure geometry of the SVG grid visualization of BlockGrid: the column and row
 * boundaries and the gap rectangles, in content coordinates (without the padding),
 * derived from the container width, the number of columns, the gap and the actual row
 * sizes taken from the DOM.
 */

export interface IGridGapRectX {
    x: number;
    width: number;
}

export interface IGridGapRectY {
    y: number;
    height: number;
}

/**
 * Computes the x coordinates of the vertical column boundaries (edges included).
 */
export function getColumnBoundaries(width: number, columns: number, gap: number): number[] {
    if (width <= 0 || columns <= 0) {
        return [0];
    }

    const totalGap = (columns - 1) * gap;
    const columnWidth = (width - totalGap) / columns;

    const boundaries: number[] = [0];
    let position = 0;

    for (let index = 0; index < columns; index += 1) {
        position += columnWidth;
        boundaries.push(position);

        if (index < columns - 1) {
            position += gap;
        }
    }

    boundaries[boundaries.length - 1] = width;
    return boundaries;
}

/**
 * Computes the rectangles of the vertical gaps between the columns.
 */
export function getColumnGapRects(width: number, columns: number, gap: number): IGridGapRectX[] {
    if (width <= 0 || columns <= 1 || gap <= 0) {
        return [];
    }

    const totalGap = (columns - 1) * gap;
    const columnWidth = (width - totalGap) / columns;
    const rects: IGridGapRectX[] = [];

    let position = columnWidth;

    for (let index = 0; index < columns - 1; index += 1) {
        rects.push({
            x: position,
            width: gap,
        });

        position += gap + columnWidth;
    }

    return rects;
}

/**
 * Computes the y coordinates of the horizontal row boundaries from the actual row sizes
 * taken from the DOM. An empty array means there is no row data (no row grid is drawn).
 */
export function getRowBoundaries(rowSizes: number[], gap: number): number[] {
    // The row grid is shown only when there really is row data
    if (rowSizes.length <= 1) {
        return [];
    }

    const boundaries: number[] = [0];
    let position = 0;

    for (let index = 0; index < rowSizes.length; index += 1) {
        position += rowSizes[index];
        boundaries.push(position);

        if (index < rowSizes.length - 1) {
            position += gap;
        }
    }

    return boundaries;
}

/**
 * Computes the rectangles of the horizontal gaps between the rows, from the actual row
 * sizes taken from the DOM.
 */
export function getRowGapRects(width: number, rowSizes: number[], gap: number): IGridGapRectY[] {
    if (width <= 0 || rowSizes.length <= 1 || gap <= 0) {
        return [];
    }

    const rects: IGridGapRectY[] = [];
    let position = rowSizes[0];

    for (let index = 0; index < rowSizes.length - 1; index += 1) {
        rects.push({
            y: position,
            height: gap,
        });

        position += gap + rowSizes[index + 1];
    }

    return rects;
}
