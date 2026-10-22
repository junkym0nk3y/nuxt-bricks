// #region Imports
// Types
import type { IDragGhostOptions, TDropFlowEntry } from '../types/drag';
import type { IBricksComponent, ICanvasDragState } from '../../../common/types/brick';

// Utils
import { convertPxToRem } from '../../../common/utils/main';
// #endregion

// #region Data
/**
 * Lowest height of a flow placeholder. It is needed when the measurement of the block
 * came out 0 — a user brick whose preview had not rendered yet at dragstart, for
 * instance: the drop position has to be visible all the same.
 */
const MIN_PLACEHOLDER_HEIGHT = 24;
const CANVAS_GHOST_MIN_WIDTH = 120;
const CANVAS_GHOST_MAX_WIDTH = 340;
const CANVAS_GHOST_MIN_HEIGHT = 68;
const CANVAS_GHOST_MAX_HEIGHT = 170;
const LIBRARY_GHOST_MIN_WIDTH = 124;
const LIBRARY_GHOST_MAX_WIDTH = 220;
const LIBRARY_GHOST_MIN_HEIGHT = 68;
const LIBRARY_GHOST_MAX_HEIGHT = 120;
// #endregion

// #region Methods
/**
 * Returns the CSS variables that size the flow placeholder of the canvas root.
 * Every placeholder (the root, the slots, the layout zones) reads its size from here
 * and nowhere else.
 *
 * @param dragState - Transient drag state of the canvas store.
 * @returns CSS custom properties for the style of the canvas.
 */
export function getDragPlaceholderVars(dragState: ICanvasDragState): Record<string, string> {
    return {
        '--bricks-drag-placeholder-flow-width': dragState.isFullWidth
            ? '100%'
            : convertPxToRem(dragState.width),
        '--bricks-drag-placeholder-height': convertPxToRem(
            Math.max(dragState.height, MIN_PLACEHOLDER_HEIGHT)
        ),
    };
}

/**
 * Unfolds the list of blocks and the drop position into a single flow of entries.
 *
 * `<TransitionGroup>` needs a flat keyed list: the placeholder holds a stable key, so
 * when the drop position changes it travels (a move transition) and the neighbors
 * part smoothly, instead of the flow being rebuilt in one jump.
 *
 * @param children - Blocks of the zone in display order.
 * @param dropIndex - Index of the drop position, or null when the drag is not over
 * the zone.
 * @param placeholderKey - Placeholder key, unique within the zone.
 * @returns Flow entries to render.
 */
export function buildDropFlowEntries(
    children: IBricksComponent[],
    dropIndex: number | null,
    placeholderKey: string
): TDropFlowEntry[] {
    const entries: TDropFlowEntry[] = [];

    children.forEach((component, index) => {
        if (dropIndex === index) {
            entries.push({ kind: 'placeholder', key: placeholderKey });
        }
        entries.push({ kind: 'item', key: component.id, component });
    });

    if (dropIndex === children.length) {
        entries.push({ kind: 'placeholder', key: placeholderKey });
    }

    return entries;
}

/**
 * Clamps a number to a range.
 *
 * @param value - Value to clamp.
 * @param minimum - Lower bound.
 * @param maximum - Upper bound.
 * @returns The clamped value.
 */
function clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
}

/**
 * Appends a neutral skeleton bar to the lightweight drag ghost.
 *
 * @param ghost - Container of the ghost.
 * @param width - Width of the bar.
 * @param height - Height of the bar.
 * @param color - Color, taken from a bricks token.
 */
function appendSkeletonBar(ghost: HTMLElement, width: string, height: string, color: string): void {
    const bar = document.createElement('span');
    bar.style.display = 'block';
    bar.style.width = width;
    bar.style.height = height;
    bar.style.backgroundColor = color;
    ghost.appendChild(bar);
}

/**
 * Builds a lightweight skeleton ghost without cloning the real content.
 *
 * @param options - The drag event, the source element and the placeholder size.
 */
export function setSkeletonDragImage(options: IDragGhostOptions): void {
    const dataTransfer = options.event.dataTransfer;
    if (!dataTransfer) {
        return;
    }

    const sourceRect = options.sourceElement.getBoundingClientRect();
    const isLibrary = options.variant === 'library';
    const minimumWidth = isLibrary ? LIBRARY_GHOST_MIN_WIDTH : CANVAS_GHOST_MIN_WIDTH;
    const maximumWidth = isLibrary ? LIBRARY_GHOST_MAX_WIDTH : CANVAS_GHOST_MAX_WIDTH;
    const minimumHeight = isLibrary ? LIBRARY_GHOST_MIN_HEIGHT : CANVAS_GHOST_MIN_HEIGHT;
    const maximumHeight = isLibrary ? LIBRARY_GHOST_MAX_HEIGHT : CANVAS_GHOST_MAX_HEIGHT;
    const ghostWidth = clamp(
        sourceRect.width || options.placeholderSize.width,
        minimumWidth,
        maximumWidth
    );
    const ghostHeight = clamp(
        sourceRect.height || options.placeholderSize.height,
        minimumHeight,
        maximumHeight
    );

    const ghost = document.createElement('div');
    ghost.classList.add('bricks-canvas');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.position = 'absolute';
    ghost.style.top = '-100rem';
    ghost.style.left = '-100rem';
    ghost.style.zIndex = '9999';
    ghost.style.boxSizing = 'border-box';
    ghost.style.display = 'flex';
    ghost.style.flexDirection = 'column';
    ghost.style.justifyContent = 'center';
    ghost.style.gap = '1.2rem';
    ghost.style.overflow = 'hidden';
    ghost.style.width = convertPxToRem(ghostWidth);
    ghost.style.height = convertPxToRem(ghostHeight);
    ghost.style.padding = '1.8rem';
    ghost.style.border = '0.2rem dashed var(--bricks-primary)';
    ghost.style.backgroundColor =
        'color-mix(in srgb, var(--bricks-primary) 8%, var(--bricks-static-white))';
    ghost.style.boxShadow = 'var(--bricks-shadow-lg)';
    ghost.style.pointerEvents = 'none';

    appendSkeletonBar(ghost, '45%', '1.2rem', 'var(--bricks-base-300)');
    appendSkeletonBar(ghost, '88%', '0.8rem', 'var(--bricks-base-200)');
    appendSkeletonBar(ghost, '72%', '0.8rem', 'var(--bricks-base-200)');
    if (!isLibrary) {
        appendSkeletonBar(ghost, '36%', '2.6rem', 'var(--bricks-base-200)');
    }

    document.body.appendChild(ghost);

    const relativeX =
        sourceRect.width > 0 ? (options.event.clientX - sourceRect.left) / sourceRect.width : 0.5;
    const relativeY =
        sourceRect.height > 0 ? (options.event.clientY - sourceRect.top) / sourceRect.height : 0.5;
    const offsetX = clamp(relativeX, 0, 1) * ghostWidth;
    const offsetY = clamp(relativeY, 0, 1) * ghostHeight;
    dataTransfer.setDragImage(ghost, offsetX, offsetY);

    /** Removes the temporary DOM node once the browser has taken the drag bitmap */
    function removeDragGhost(): void {
        ghost.remove();
    }

    window.setTimeout(removeDragGhost, 0);
}
// #endregion
