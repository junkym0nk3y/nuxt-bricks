// Vue
import { onMounted, onBeforeUnmount, watch, type Ref } from 'vue';

// Pinia
import { useCanvasStore } from '../../../core/stores/canvas';

/** Ширина краевой зоны контейнера, в которой драг начинает подкручивать канвас. */
const EDGE_ZONE_PX = 110;

/** Максимальная скорость автоскролла (px за кадр) у самой границы контейнера. */
const MAX_SPEED_PX = 26;

/**
 * Автоскролл канваса во время нативного drag & drop.
 *
 * Нативный HTML5-драг забирает ввод себе: колесо и трекпад до `.canvasArea` не
 * доходят (в Blink проверено — событий нет), поэтому во время перетаскивания канвас
 * прокручивается только так: пока курсор держат у края контейнера, скролл
 * подкручиваем сами, скорость растёт линейно от границы зоны к самому краю.
 *
 * Работает и для canvas-драга, и для карточек библиотеки: события слушаются на
 * document, поэтому координаты приходят независимо от того, чей payload тащат.
 *
 * @param containerRef - Скроллируемый контейнер канваса (.canvasArea).
 */
export function useCanvasDragAutoScroll(containerRef: Ref<HTMLElement | null>): void {
    const canvasStore = useCanvasStore();

    let frameId: number | null = null;
    let speedX = 0;
    let speedY = 0;

    /**
     * Считает скорость подкрутки для одной оси.
     *
     * Ноль — если курсор вне краевых зон или ушёл за пределы контейнера дальше
     * ширины зоны (тащат в сайдбар — канвас крутиться не должен).
     *
     * @param position - Координата курсора по оси.
     * @param start - Начало контейнера по этой оси (left/top).
     * @param end - Конец контейнера по этой оси (right/bottom).
     * @returns Смещение скролла за кадр: отрицательное — к началу, положительное — к концу.
     */
    function resolveAxisSpeed(position: number, start: number, end: number): number {
        const distanceToStart = position - start;
        const distanceToEnd = end - position;

        if (distanceToStart < -EDGE_ZONE_PX || distanceToEnd < -EDGE_ZONE_PX) {
            return 0;
        }

        if (distanceToStart < EDGE_ZONE_PX) {
            const ratio = Math.min(1, (EDGE_ZONE_PX - distanceToStart) / EDGE_ZONE_PX);
            return -MAX_SPEED_PX * ratio;
        }

        if (distanceToEnd < EDGE_ZONE_PX) {
            const ratio = Math.min(1, (EDGE_ZONE_PX - distanceToEnd) / EDGE_ZONE_PX);
            return MAX_SPEED_PX * ratio;
        }

        return 0;
    }

    /**
     * Останавливает автоскролл и обнуляет накопленную скорость.
     */
    function stopAutoScroll(): void {
        if (frameId !== null) {
            cancelAnimationFrame(frameId);
            frameId = null;
        }
        speedX = 0;
        speedY = 0;
    }

    /**
     * Кадр автоскролла: крутит контейнер с текущей скоростью.
     *
     * Скорость живёт между кадрами, потому что при неподвижном курсоре браузер
     * шлёт `dragover` лишь раз в ~350 мс — иначе скролл бы дёргался.
     */
    function scrollFrame(): void {
        const container = containerRef.value;

        if (!container || (speedX === 0 && speedY === 0)) {
            stopAutoScroll();
            return;
        }

        container.scrollLeft += speedX;
        container.scrollTop += speedY;
        frameId = requestAnimationFrame(scrollFrame);
    }

    /**
     * Пересчитывает скорость по позиции курсора и поддерживает rAF-цикл живым.
     *
     * Слушаются оба события: `dragover` (летит от элемента под курсором) и `drag`
     * (летит источнику независимо от того, что под курсором) — над областями, где
     * `dragover` не приходит, координаты даёт `drag`.
     *
     * @param event - Drag- или dragover-событие документа.
     */
    function handleDragPointerMove(event: DragEvent): void {
        const container = containerRef.value;

        if (!container || canvasStore.dragState.source === null) {
            stopAutoScroll();
            return;
        }

        // Финальные `drag`-события Chrome шлёт с нулевыми координатами — это не
        // «курсор в левом верхнем углу», а отсутствие позиции: скорость не трогаем
        if (event.clientX === 0 && event.clientY === 0) {
            return;
        }

        const rect = container.getBoundingClientRect();
        speedX = resolveAxisSpeed(event.clientX, rect.left, rect.right);
        speedY = resolveAxisSpeed(event.clientY, rect.top, rect.bottom);

        if ((speedX !== 0 || speedY !== 0) && frameId === null) {
            frameId = requestAnimationFrame(scrollFrame);
        }
    }

    // Страховка на случай, если drag-сессия закончилась без dragend/drop над документом
    watch(
        () => canvasStore.dragState.source,
        (source) => {
            if (source === null) {
                stopAutoScroll();
            }
        }
    );

    // Capture обязателен: слот- и layout-зоны глушат `dragover` через stopPropagation,
    // и на всплытии автоскролл вставал бы ровно над ними — то есть над большей
    // частью канваса.
    onMounted(() => {
        document.addEventListener('dragover', handleDragPointerMove, {
            capture: true,
            passive: true,
        });
        document.addEventListener('drag', handleDragPointerMove, {
            capture: true,
            passive: true,
        });
        document.addEventListener('dragend', stopAutoScroll, true);
        document.addEventListener('drop', stopAutoScroll, true);
    });

    onBeforeUnmount(() => {
        document.removeEventListener('dragover', handleDragPointerMove, true);
        document.removeEventListener('drag', handleDragPointerMove, true);
        document.removeEventListener('dragend', stopAutoScroll, true);
        document.removeEventListener('drop', stopAutoScroll, true);
        stopAutoScroll();
    });
}
