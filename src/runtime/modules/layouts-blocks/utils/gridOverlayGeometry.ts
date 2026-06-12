/**
 * Чистая геометрия SVG-визуализации сетки BlockGrid:
 * границы колонок/строк и прямоугольники gap'ов в content-координатах
 * (без padding), от ширины контейнера, числа колонок, gap и реальных
 * размеров строк из DOM.
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
 * Вычисляет x-координаты вертикальных границ колонок (включая края).
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
 * Вычисляет прямоугольники вертикальных gap между колонками.
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
 * Вычисляет y-координаты горизонтальных границ строк по реальным размерам
 * строк из DOM. Пустой массив — данных о строках нет (сетка строк не рисуется).
 */
export function getRowBoundaries(rowSizes: number[], gap: number): number[] {
    // Показываем сетку строк только если есть реальные данные о строках
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
 * Вычисляет прямоугольники горизонтальных gap между строками
 * по реальным размерам строк из DOM.
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
