// #region Imports
// Types
import type { IDragVisualSize } from '../types/brick';
// #endregion

// #region Data
/**
 * Доля ширины родителя, с которой блок считается полноширинным:
 * плейсхолдер такого блока растягивается на 100% вместо фиксированных px.
 */
const FULL_WIDTH_RATIO = 0.95;

const PLACEHOLDER_APPEAR_DURATION = 140;
const PLACEHOLDER_MOVE_DURATION = 160;
const PLACEHOLDER_EASING = 'cubic-bezier(0.2, 0, 0, 1)';
// #endregion

// #region Methods
/**
 * Определяет, что именно перетаскивают: существующий компонент канваса,
 * карточку библиотеки или чужой payload (файл ОС, узел дерева схемы).
 *
 * @param event - Текущее drag-событие.
 * @returns Признаки payload; `isAccepted` — можно ли принимать drop.
 */
function resolveDragPayload(event: DragEvent): {
    isExisting: boolean;
    isLibrary: boolean;
    isAccepted: boolean;
} {
    const types = Array.from(event.dataTransfer?.types || []);
    const isExisting = types.includes('component-id') || types.includes('text/plain');
    const isLibrary = types.includes('application/json');

    return { isExisting, isLibrary, isAccepted: isExisting || isLibrary };
}

/**
 * Выставляет `dropEffect` по типу payload. Без явного эффекта браузер
 * может отклонить drop, а чужой payload не должен подсвечивать зону.
 *
 * @param event - Текущее drag-событие.
 * @returns Принимается ли payload текущей зоной.
 */
export function applyDropEffect(event: DragEvent): boolean {
    const { isExisting, isAccepted } = resolveDragPayload(event);

    if (!event.dataTransfer) {
        return isAccepted;
    }

    if (!isAccepted) {
        event.dataTransfer.dropEffect = 'none';
        return false;
    }

    event.dataTransfer.dropEffect = isExisting ? 'move' : 'copy';
    return true;
}

/**
 * Анимирует место вставки, живущее вне Vue-потока (layout-зоны вставляют его в DOM
 * императивно, поэтому `<TransitionGroup>` его не видит).
 *
 * Первое появление — мягкий fade-in; смена позиции — FLIP-переезд от прежних
 * координат. Через Web Animations API, а не CSS: перестановка узла в DOM
 * перезапускала бы CSS-анимацию появления, и плейсхолдер мигал бы на каждом шаге.
 *
 * @param element - Элемент плейсхолдера, уже вставленный в новую позицию.
 * @param previousRect - Прежние координаты элемента или null, если он только появился.
 */
export function animateFlowPlaceholder(element: HTMLElement, previousRect: DOMRect | null): void {
    if (typeof element.animate !== 'function') {
        return;
    }

    if (!previousRect) {
        element.animate(
            [
                { opacity: 0, transform: 'scale(0.97)' },
                { opacity: 1, transform: 'none' },
            ],
            { duration: PLACEHOLDER_APPEAR_DURATION, easing: PLACEHOLDER_EASING }
        );
        return;
    }

    const nextRect = element.getBoundingClientRect();
    const shiftX = previousRect.left - nextRect.left;
    const shiftY = previousRect.top - nextRect.top;

    if (shiftX === 0 && shiftY === 0) {
        return;
    }

    element.animate([{ transform: `translate(${shiftX}px, ${shiftY}px)` }, { transform: 'none' }], {
        duration: PLACEHOLDER_MOVE_DURATION,
        easing: PLACEHOLDER_EASING,
    });
}

/**
 * Измеряет фактический размер блока для drag-визуалов (призрак и плейсхолдер).
 * Источник истины — отрендеренный DOM, никаких хардкод-оценок по типу блока.
 *
 * @param element - Измеряемый элемент.
 * @returns Размер и признак полноширинного блока.
 */
export function measureDragSize(element: HTMLElement | null): IDragVisualSize {
    if (!element) {
        return { width: 0, height: 0, isFullWidth: false };
    }

    const rect = element.getBoundingClientRect();
    const width = element.offsetWidth || element.scrollWidth || rect.width;
    const height = element.offsetHeight || element.scrollHeight || rect.height;
    const parentWidth = element.parentElement?.clientWidth ?? width;

    return {
        width,
        height,
        isFullWidth: parentWidth > 0 && width >= parentWidth * FULL_WIDTH_RATIO,
    };
}
// #endregion
