// Vue
import { ref, computed, type Ref } from 'vue';

/**
 * Drop-индикатор слайдера: позиция вертикальной линии вставки между слайдами
 * по координате курсора (исключая Swiper-дубликаты при loop).
 */
export function useSliderDropIndicator(containerRef: Ref<HTMLElement | null>) {
    const dropIndicator = ref<{ index: number; offset: number } | null>(null);
    const dropInsertIndex = ref<number | null>(null);

    const dropIndicatorStyle = computed<Record<string, string>>(() => {
        if (!dropIndicator.value) {
            return {
                opacity: '0',
                left: '0',
            };
        }
        return {
            opacity: '1',
            left: `${dropIndicator.value.offset}px`,
        };
    });

    /**
     * Возвращает список элементов слайдов, доступных для drag&drop (исключая дубликаты Swiper).
     *
     * @returns Коллекция HTMLElement, которые можно использовать как drop-мишени.
     */
    function getDraggableSlides(): HTMLElement[] {
        if (!containerRef.value) {
            return [];
        }
        const candidates = Array.from(
            containerRef.value.querySelectorAll<HTMLElement>('[data-layout-drop-item="true"]')
        );

        return candidates.filter((el) => {
            const slideEl = el.closest('.swiper-slide');
            return !(slideEl && slideEl.classList.contains('swiper-slide-duplicate'));
        });
    }

    /**
     * Сбрасывает состояние drop-индикатора.
     */
    function clearDropIndicator(): void {
        dropIndicator.value = null;
        dropInsertIndex.value = null;
    }

    /**
     * Пересчитывает позицию индикатора вставки на основании текущей позиции курсора.
     *
     * @param event - Dragover событие.
     */
    function updateDropIndicator(event: DragEvent): void {
        if (!containerRef.value) {
            return;
        }
        const slides = getDraggableSlides();
        const rect = containerRef.value.getBoundingClientRect();
        const pointerX = event.clientX;
        const containerWidth = containerRef.value.clientWidth;

        if (slides.length === 0) {
            const offset = Math.max(0, Math.min(pointerX - rect.left, containerWidth));
            dropIndicator.value = {
                index: 0,
                offset,
            };
            dropInsertIndex.value = 0;
            return;
        }

        let targetIndex = slides.length;
        let offset = containerWidth;

        for (let index = 0; index < slides.length; index += 1) {
            const slide = slides[index];
            const slideRect = slide.getBoundingClientRect();
            const midpoint = slideRect.left + slideRect.width / 2;

            if (pointerX < midpoint) {
                targetIndex = index;
                offset = slideRect.left - rect.left;
                break;
            }
        }

        if (targetIndex === slides.length) {
            const lastRect = slides[slides.length - 1].getBoundingClientRect();
            offset = lastRect.right - rect.left;
        }

        offset = Math.max(0, Math.min(offset, containerWidth));

        dropIndicator.value = {
            index: targetIndex,
            offset,
        };
        dropInsertIndex.value = targetIndex;
    }

    return {
        dropIndicator,
        dropInsertIndex,
        dropIndicatorStyle,
        updateDropIndicator,
        clearDropIndicator,
    };
}
