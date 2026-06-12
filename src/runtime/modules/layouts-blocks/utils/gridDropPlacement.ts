/**
 * Вычисляет targetIndex (ячейку грида) по позиции курсора.
 * Учитывает CSS transform (canvas scale), padding и реальный gap из computed style.
 *
 * @param event - Drop-событие с координатами курсора.
 * @param gridEl - DOM-элемент грида.
 * @param columns - Нормализованное число колонок.
 * @param rows - Нормализованное число строк.
 * @returns targetIndex или null, если невозможно вычислить.
 */
export function calculateGridDropTargetIndex(
    event: DragEvent,
    gridEl: HTMLElement | null,
    columns: number,
    rows: number
): number | null {
    const rect = gridEl?.getBoundingClientRect();
    if (!rect || !gridEl) {
        return null;
    }

    // getBoundingClientRect() возвращает визуальные размеры (после canvas scale),
    // а CSS gap/padding — в CSS-пикселях. Для согласованного расчёта
    // читаем реальный gap из computed style и вычисляем масштаб.
    const computedStyle = window.getComputedStyle(gridEl);
    const cssGap = parseFloat(computedStyle.columnGap || computedStyle.gap || '0') || 0;
    const cssRowGap = parseFloat(computedStyle.rowGap || computedStyle.gap || '0') || 0;

    // Масштаб: отношение visual к CSS (учитывает transform: scale на canvas)
    const offsetW = gridEl.offsetWidth;
    const scale = offsetW > 0 ? rect.width / offsetW : 1;

    // Переводим gap в визуальные пиксели
    const visualGap = cssGap * scale;
    const visualRowGap = cssRowGap * scale;

    // Учитываем padding (тоже в визуальных пикселях)
    const padLeft = (parseFloat(computedStyle.paddingLeft) || 0) * scale;
    const padTop = (parseFloat(computedStyle.paddingTop) || 0) * scale;
    const padRight = (parseFloat(computedStyle.paddingRight) || 0) * scale;
    const padBottom = (parseFloat(computedStyle.paddingBottom) || 0) * scale;

    const contentWidth = rect.width - padLeft - padRight;
    const columnWidth = (contentWidth - (columns - 1) * visualGap) / columns;

    const x = event.clientX - rect.left - padLeft;
    let column = Math.floor(x / (columnWidth + visualGap));
    column = Math.max(0, Math.min(column, columns - 1));

    const contentHeight = rect.height - padTop - padBottom;
    const availableHeight = contentHeight - (rows - 1) * visualRowGap;
    const singleRowHeight = availableHeight / rows;

    const y = event.clientY - rect.top - padTop;
    let row = Math.floor(y / (singleRowHeight + visualRowGap));
    row = Math.max(0, Math.min(row, rows - 1));

    return row * columns + column;
}
