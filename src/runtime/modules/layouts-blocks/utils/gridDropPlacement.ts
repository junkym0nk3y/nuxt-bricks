/**
 * Parses a grid-template-* value out of the computed style into track sizes (CSS px).
 *
 * @param templateValue - Value of `gridTemplateColumns`/`gridTemplateRows`.
 * @returns Track sizes in order.
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
 * Finds the track a point falls into.
 *
 * Grid rows almost always differ in height (`rowHeight: auto`), so the content cannot
 * be split into equal bands — the actual track sizes are walked instead.
 *
 * @param position - Offset of the point inside the content box of the zone (CSS px).
 * @param tracks - Track sizes (CSS px).
 * @param gap - Gap between the tracks (CSS px).
 * @returns Track index; outside the bounds, the outermost one.
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
 * Checks that the tracks add up to a non-zero size.
 *
 * @param tracks - Track sizes.
 * @returns Whether there is anything to compute the cursor hit against.
 */
function hasSize(tracks: number[]): boolean {
    return tracks.reduce((total, track) => total + track, 0) > 0;
}

/**
 * Splits the area into equal tracks — the fallback for when the actual tracks are
 * zero (an empty grid with `rowHeight: auto` is held open by its min-height alone).
 *
 * @param position - Offset of the point inside the content box of the zone (CSS px).
 * @param count - Number of tracks.
 * @param contentSize - Size of the content box along the axis (CSS px).
 * @param gap - Gap between the tracks (CSS px).
 * @returns Track index within count.
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
 * Computes the targetIndex (the grid cell) from the cursor position.
 * Accounts for the CSS transform (canvas scale), the padding, and the real gaps and
 * track sizes.
 *
 * @param event - Drop event carrying the cursor coordinates.
 * @param gridEl - Grid DOM element.
 * @param columns - Normalized number of columns.
 * @param rows - Normalized number of rows.
 * @returns targetIndex, or null when it cannot be computed.
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

    // getBoundingClientRect() gives the visual sizes (after the canvas scale), while
    // the computed style gives CSS pixels. Bringing the cursor point to CSS pixels lets
    // the tracks, the gaps and the padding be used as they are.
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

    // Implicit tracks (the placeholder itself or the content may have added them) are
    // left out of the calculation: the addressable capacity of the grid is exactly
    // columns × rows.
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
