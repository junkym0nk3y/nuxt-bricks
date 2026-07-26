// #region Data
/**
 * Класс канваса, снимающий move-переходы потока (`bricks-canvas-flow-move`).
 *
 * `<TransitionGroup>` сравнивает экранные координаты детей до и после патча, поэтому
 * реагирует не только на перестановку блоков, но и на любое изменение геометрии
 * канваса — зум, смену viewport, применение drop. В таких кадрах анимировать нечего:
 * блоки не переезжали, «доводка» выглядит как дрожание.
 */
const CANVAS_FLOW_INSTANT_CLASS = 'bricks-canvas--flow-instant';
// #endregion

// #region Methods
/**
 * Помечает канвас как перерисовывающийся без анимации потока.
 *
 * @param canvas - Корневой элемент канваса.
 */
export function markCanvasFlowInstant(canvas: HTMLElement | null): void {
    canvas?.classList.add(CANVAS_FLOW_INSTANT_CLASS);
}

/**
 * Возвращает канвасу обычные переходы потока.
 *
 * @param canvas - Корневой элемент канваса.
 */
export function clearCanvasFlowInstant(canvas: HTMLElement | null): void {
    canvas?.classList.remove(CANVAS_FLOW_INSTANT_CLASS);
}

/**
 * Отключает переходы потока на текущую перерисовку.
 *
 * Кадров два: Vue проверяет наличие transform-перехода уже после патча DOM,
 * поэтому класс должен пережить и патч, и следующий за ним кадр отрисовки.
 *
 * @param canvas - Корневой элемент канваса.
 */
export function suspendCanvasFlowTransitions(canvas: HTMLElement | null): void {
    if (!canvas) {
        return;
    }

    markCanvasFlowInstant(canvas);
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            clearCanvasFlowInstant(canvas);
        });
    });
}
// #endregion
