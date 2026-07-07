// Vue
import { watch, onBeforeUnmount, nextTick, type Ref } from 'vue';

// Pinia
import { useCanvasStore } from '../../../core/stores/canvas';

// Constants
import { CANVAS_ZOOM_STEP } from '../../../core/constants/canvasScale';

/** Чувствительность мультипликативного зума колесом (px deltaY → множитель). */
const WHEEL_ZOOM_INTENSITY = 0.002;

/** px на строку для deltaMode = DOM_DELTA_LINE (Firefox). */
const LINE_HEIGHT_PX = 16;

/** Задержка восстановления CSS-transition после серии zoom-событий. */
const TRANSITION_RESTORE_DELAY_MS = 300;

/**
 * Wheel-взаимодействия канваса: Ctrl(⌘)+scroll — зум к курсору
 * (ctrl+pinch трекпада попадает сюда же — браузер шлёт wheel с ctrlKey),
 * Shift+scroll — горизонтальный скролл для мыши. Кнопочный зум (±) идёт
 * через те же формулы с якорем в центре видимой области.
 *
 * @param containerRef - Ссылка на скроллируемый контейнер канваса (.canvasArea).
 */
export function useCanvasWheel(containerRef: Ref<HTMLElement | null>) {
    const canvasStore = useCanvasStore();

    let transitionRestoreTimeout: ReturnType<typeof setTimeout> | null = null;
    let suppressedTarget: HTMLElement | null = null;

    /**
     * Возвращает масштабируемый элемент внутри контейнера
     * (.canvas в обычном режиме, .figmaWrapper в Figma mode).
     */
    function getZoomTarget(): HTMLElement | null {
        return containerRef.value?.querySelector<HTMLElement>('[data-canvas-zoom-target]') ?? null;
    }

    /**
     * Временно отключает transition на масштабируемом элементе: transform
     * должен применяться мгновенно, иначе scroll-коррекция zoom-to-cursor
     * разъезжается с анимацией. Восстанавливается после паузы в зуме.
     *
     * @param target - Элемент с transform-масштабом.
     */
    function suppressTransition(target: HTMLElement): void {
        target.style.transition = 'none';
        suppressedTarget = target;

        if (transitionRestoreTimeout !== null) {
            clearTimeout(transitionRestoreTimeout);
        }

        transitionRestoreTimeout = setTimeout(() => {
            restoreTransition();
        }, TRANSITION_RESTORE_DELAY_MS);
    }

    /**
     * Возвращает элементу transition из CSS (снимает inline-подавление).
     */
    function restoreTransition(): void {
        if (suppressedTarget) {
            suppressedTarget.style.transition = '';
            suppressedTarget = null;
        }
        transitionRestoreTimeout = null;
    }

    /**
     * Меняет масштаб так, чтобы точка канваса под (clientX, clientY)
     * осталась на месте: после применения нового transform корректирует
     * scrollLeft/scrollTop по фактическим bounding rect до/после.
     *
     * @param targetScale - Желаемый масштаб (будет ограничен store'ом).
     * @param clientX - Экранная X-координата якоря зума.
     * @param clientY - Экранная Y-координата якоря зума.
     */
    async function zoomAtPoint(
        targetScale: number,
        clientX: number,
        clientY: number
    ): Promise<void> {
        const container = containerRef.value;
        const zoomTarget = getZoomTarget();

        if (!container || !zoomTarget) {
            canvasStore.setManualCanvasScale(targetScale);
            return;
        }

        const oldScale = canvasStore.scale;
        canvasStore.setManualCanvasScale(targetScale);
        const newScale = canvasStore.scale;

        if (newScale === oldScale) {
            return;
        }

        // Мгновенный transform (rect до/после должны быть честными, не анимационными)
        suppressTransition(zoomTarget);

        // DOM ещё со старым transform: позиция якоря в визуальных координатах канваса
        const rectBefore = zoomTarget.getBoundingClientRect();
        const pointX = clientX - rectBefore.left;
        const pointY = clientY - rectBefore.top;
        const ratio = newScale / oldScale;

        await nextTick();

        // Новый transform применён — возвращаем якорь под курсор
        const rectAfter = zoomTarget.getBoundingClientRect();
        container.scrollLeft += rectAfter.left + pointX * ratio - clientX;
        container.scrollTop += rectAfter.top + pointY * ratio - clientY;
    }

    /**
     * Зум с якорем в центре видимой области канваса (для кнопок ±).
     *
     * @param targetScale - Желаемый масштаб.
     */
    function zoomAtViewportCenter(targetScale: number): void {
        const container = containerRef.value;

        if (!container) {
            canvasStore.setManualCanvasScale(targetScale);
            return;
        }

        const rect = container.getBoundingClientRect();
        zoomAtPoint(targetScale, rect.left + rect.width / 2, rect.top + rect.height / 2);
    }

    /**
     * Увеличивает масштаб на шаг кнопки (зум к центру видимой области).
     */
    function zoomInAtCenter(): void {
        zoomAtViewportCenter(canvasStore.scale + CANVAS_ZOOM_STEP);
    }

    /**
     * Уменьшает масштаб на шаг кнопки (зум к центру видимой области).
     */
    function zoomOutAtCenter(): void {
        zoomAtViewportCenter(canvasStore.scale - CANVAS_ZOOM_STEP);
    }

    /**
     * Приводит deltaY к пикселям (Firefox шлёт deltaMode = DOM_DELTA_LINE).
     *
     * @param event - Wheel-событие.
     */
    function normalizeDeltaY(event: WheelEvent): number {
        return event.deltaMode === WheelEvent.DOM_DELTA_LINE
            ? event.deltaY * LINE_HEIGHT_PX
            : event.deltaY;
    }

    /**
     * Обработчик wheel: ctrl/⌘ — зум к курсору, shift — горизонтальный
     * скролл (только для мыши: трекпад macOS шлёт deltaX нативно).
     *
     * @param event - Wheel-событие контейнера.
     */
    function handleWheel(event: WheelEvent): void {
        const container = containerRef.value;

        if (!container) {
            return;
        }

        if (event.ctrlKey || event.metaKey) {
            // Подавляем браузерный pinch-zoom страницы только внутри канваса
            event.preventDefault();
            const factor = Math.exp(-normalizeDeltaY(event) * WHEEL_ZOOM_INTENSITY);
            zoomAtPoint(canvasStore.scale * factor, event.clientX, event.clientY);
            return;
        }

        if (event.shiftKey && event.deltaX === 0 && event.deltaY !== 0) {
            event.preventDefault();
            container.scrollLeft += normalizeDeltaY(event);
        }
    }

    // Non-passive listener: preventDefault для ctrl+wheel обязан работать
    watch(
        containerRef,
        (el, prev) => {
            prev?.removeEventListener('wheel', handleWheel);
            el?.addEventListener('wheel', handleWheel, { passive: false });
        },
        { immediate: true }
    );

    onBeforeUnmount(() => {
        containerRef.value?.removeEventListener('wheel', handleWheel);
        if (transitionRestoreTimeout !== null) {
            clearTimeout(transitionRestoreTimeout);
        }
        restoreTransition();
    });

    return {
        zoomInAtCenter,
        zoomOutAtCenter,
    };
}
