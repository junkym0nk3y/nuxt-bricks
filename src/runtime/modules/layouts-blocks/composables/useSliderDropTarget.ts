// #region Imports
// Vue
import { ref, type Ref } from 'vue';
// #endregion

/**
 * Computes the insertion index between slides without a separate indicator line.
 *
 * @param containerRef - Root of the Slider layout block.
 */
export function useSliderDropTarget(containerRef: Ref<HTMLElement | null>) {
    const dropInsertIndex = ref<number | null>(null);

    /**
     * Returns the real Swiper slides, without the loop duplicates.
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
     * Resets the computed insertion target.
     */
    function clearDropTarget(): void {
        dropInsertIndex.value = null;
    }

    /**
     * Recomputes the insertion index from the horizontal position of the cursor.
     *
     * @param event - Browser dragover event.
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
