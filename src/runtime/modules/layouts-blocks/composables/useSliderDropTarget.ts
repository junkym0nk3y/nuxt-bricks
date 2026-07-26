// #region Imports
// Vue
import { ref, type Ref } from 'vue';
// #endregion

/**
 * Вычисляет индекс вставки между слайдами без отдельной линии-индикатора.
 *
 * @param containerRef - Корень Slider layout-блока.
 */
export function useSliderDropTarget(containerRef: Ref<HTMLElement | null>) {
    const dropInsertIndex = ref<number | null>(null);

    /**
     * Возвращает реальные Swiper-слайды без loop-дубликатов.
     */
    function getDraggableSlides(): HTMLElement[] {
        const wrapper = containerRef.value?.querySelector<HTMLElement>('.swiper-wrapper') ?? null;
        if (!wrapper) {
            return [];
        }

        return Array.from(
            wrapper.querySelectorAll<HTMLElement>(
                ':scope > .swiper-slide:not(.swiper-slide-duplicate):not([data-layout-drop-destination])'
            )
        );
    }

    /**
     * Сбрасывает вычисленную цель вставки.
     */
    function clearDropTarget(): void {
        dropInsertIndex.value = null;
    }

    /**
     * Пересчитывает индекс вставки по горизонтальной позиции курсора.
     *
     * @param event - Dragover-событие браузера.
     */
    function updateDropTarget(event: DragEvent): void {
        const slides = getDraggableSlides();
        let targetIndex = slides.length;

        for (let index = 0; index < slides.length; index += 1) {
            const slideRect = slides[index].getBoundingClientRect();
            if (event.clientX < slideRect.left + slideRect.width / 2) {
                targetIndex = index;
                break;
            }
        }

        dropInsertIndex.value = targetIndex;
    }

    return {
        dropInsertIndex,
        getDraggableSlides,
        updateDropTarget,
        clearDropTarget,
    };
}
