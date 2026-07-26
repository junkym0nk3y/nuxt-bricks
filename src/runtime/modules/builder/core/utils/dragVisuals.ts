// #region Imports
// Types
import type { IDragGhostOptions, TDropFlowEntry } from '../types/drag';
import type { IBricksComponent, ICanvasDragState } from '../../../common/types/brick';

// Utils
import { convertPxToRem } from '../../../common/utils/main';
// #endregion

// #region Data
/**
 * Минимальная высота flow-плейсхолдера. Нужна, когда замер блока дал 0 —
 * например, user-brick, чьё превью на момент dragstart ещё не отрендерилось:
 * место вставки всё равно должно быть видно.
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
 * Отдаёт CSS-переменные размера flow-плейсхолдера для корня канваса.
 * Плейсхолдеры (root, слоты, layout-зоны) читают размер только отсюда.
 *
 * @param dragState - Transient drag-состояние стора канваса.
 * @returns Пары CSS custom properties для style канваса.
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
 * Разворачивает список блоков и позицию вставки в единый поток записей.
 *
 * Плоский keyed-список нужен `<TransitionGroup>`: плейсхолдер держит стабильный
 * ключ, поэтому при смене позиции вставки он переезжает (move-переход), а соседи
 * плавно расходятся, вместо мгновенного пересбора потока.
 *
 * @param children - Блоки зоны в порядке отображения.
 * @param dropIndex - Индекс места вставки или null, если драг не над зоной.
 * @param placeholderKey - Уникальный в пределах зоны ключ плейсхолдера.
 * @returns Записи потока для рендера.
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
 * Ограничивает числовое значение заданным диапазоном.
 *
 * @param value - Исходное значение.
 * @param minimum - Нижняя граница.
 * @param maximum - Верхняя граница.
 * @returns Нормализованное значение.
 */
function clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
}

/**
 * Добавляет нейтральную skeleton-полоску в лёгкий drag ghost.
 *
 * @param ghost - Контейнер призрака.
 * @param width - Ширина полоски.
 * @param height - Высота полоски.
 * @param color - Цвет из bricks-токена.
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
 * Создаёт лёгкий skeleton-призрак без клонирования реального контента.
 *
 * @param options - Drag-событие, источник и размер плейсхолдера.
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

    /** Удаляет временный DOM-узел после того, как браузер снимет drag bitmap. */
    function removeDragGhost(): void {
        ghost.remove();
    }

    window.setTimeout(removeDragGhost, 0);
}
// #endregion
