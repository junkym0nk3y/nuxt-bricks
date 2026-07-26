/**
 * Разбирает значение grid-template-* из computed style в размеры треков (CSS px).
 *
 * @param templateValue - Значение `gridTemplateColumns`/`gridTemplateRows`.
 * @returns Размеры треков в порядке следования.
 */
export function parseGridTracks(templateValue: string | undefined): number[] {
    if (!templateValue || templateValue === 'none') {
        return [];
    }

    return templateValue
        .split(/\s+/)
        .map((track) => parseFloat(track))
        .filter((track) => Number.isFinite(track));
}

/**
 * Находит трек, в который попадает точка.
 *
 * Ряды грида почти всегда разной высоты (`rowHeight: auto`), поэтому делить
 * контент на равные полосы нельзя — идём по фактическим размерам треков.
 *
 * @param position - Смещение точки внутри content-box зоны (CSS px).
 * @param tracks - Размеры треков (CSS px).
 * @param gap - Зазор между треками (CSS px).
 * @returns Индекс трека; за пределами — крайний.
 */
export function resolveGridTrackIndex(position: number, tracks: number[], gap: number): number {
    if (tracks.length === 0) {
        return 0;
    }

    if (position <= 0) {
        return 0;
    }

    let offset = 0;

    for (let index = 0; index < tracks.length; index += 1) {
        const isLast = index === tracks.length - 1;
        const trackEnd = offset + tracks[index] + (isLast ? 0 : gap);

        if (position < trackEnd) {
            return index;
        }

        offset = trackEnd;
    }

    return tracks.length - 1;
}

/**
 * Проверяет, что треки имеют ненулевой суммарный размер.
 *
 * @param tracks - Размеры треков.
 * @returns Есть ли по чему считать попадание курсора.
 */
function hasSize(tracks: number[]): boolean {
    return tracks.reduce((total, track) => total + track, 0) > 0;
}

/**
 * Делит область на равные треки — резерв для случая, когда фактические треки
 * нулевые (пустой грид с `rowHeight: auto` растянут только своим min-height).
 *
 * @param position - Смещение точки внутри content-box зоны (CSS px).
 * @param count - Количество треков.
 * @param contentSize - Размер content-box вдоль оси (CSS px).
 * @param gap - Зазор между треками (CSS px).
 * @returns Индекс трека в пределах count.
 */
export function resolveUniformTrackIndex(
    position: number,
    count: number,
    contentSize: number,
    gap: number
): number {
    if (count <= 1) {
        return 0;
    }

    const trackSize = (contentSize - (count - 1) * gap) / count;
    if (trackSize <= 0) {
        return 0;
    }

    const index = Math.floor(position / (trackSize + gap));

    return Math.max(0, Math.min(index, count - 1));
}

/**
 * Вычисляет targetIndex (ячейку грида) по позиции курсора.
 * Учитывает CSS transform (canvas scale), padding, реальные gap и размеры треков.
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

    // getBoundingClientRect() отдаёт визуальные размеры (после canvas scale), а
    // computed style — CSS-пиксели. Приводим точку курсора к CSS-пикселям, тогда
    // треки, gap и padding используются как есть.
    const computedStyle = window.getComputedStyle(gridEl);
    const offsetWidth = gridEl.offsetWidth;
    const scale = offsetWidth > 0 ? rect.width / offsetWidth : 1;
    const safeScale = scale > 0 ? scale : 1;

    const columnGap = parseFloat(computedStyle.columnGap || computedStyle.gap || '0') || 0;
    const rowGap = parseFloat(computedStyle.rowGap || computedStyle.gap || '0') || 0;
    const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
    const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
    const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
    const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;

    const x = (event.clientX - rect.left) / safeScale - paddingLeft;
    const y = (event.clientY - rect.top) / safeScale - paddingTop;

    // Неявные треки (их мог добавить сам плейсхолдер или контент) в расчёт не идут:
    // адресуемая ёмкость грида — ровно columns × rows.
    const columnTracks = parseGridTracks(computedStyle.gridTemplateColumns).slice(0, columns);
    const rowTracks = parseGridTracks(computedStyle.gridTemplateRows).slice(0, rows);

    const contentWidth = rect.width / safeScale - paddingLeft - paddingRight;
    const contentHeight = rect.height / safeScale - paddingTop - paddingBottom;

    const column = hasSize(columnTracks)
        ? resolveGridTrackIndex(x, columnTracks, columnGap)
        : resolveUniformTrackIndex(x, columns, contentWidth, columnGap);
    const row = hasSize(rowTracks)
        ? resolveGridTrackIndex(y, rowTracks, rowGap)
        : resolveUniformTrackIndex(y, rows, contentHeight, rowGap);

    return Math.min(row, rows - 1) * columns + Math.min(column, columns - 1);
}
