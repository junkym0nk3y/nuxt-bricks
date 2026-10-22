// #region Imports
// Vue
import { type Ref } from 'vue';

// Utils
import { resolveLinearDropIndex } from '../utils/linearDropPlacement';
// #endregion

/**
 * The slide selection of a Slider block and the insertion index computed over it.
 *
 * The selection earns its own composable because it is asked for twice — once to
 * compute the index, once to insert the flow placeholder between the slides — and
 * both have to see the very same set of nodes. The walk itself is shared with every
 * other flow zone.
 *
 * @param containerRef - Root of the Slider layout block.
 */
export function useSliderDropTarget(containerRef: Ref<HTMLElement | null>) {
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
     * Index of the insertion point between the slides, by the horizontal cursor position.
     *
     * @param event - Browser drag event.
     * @returns Index of the insertion point, up to the number of slides.
     */
    function resolveSliderDropIndex(event: DragEvent): number {
        return resolveLinearDropIndex(event, 'horizontal', getDraggableSlides);
    }

    return {
        getDraggableSlides,
        resolveSliderDropIndex,
    };
}
