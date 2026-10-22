// Vue
import { nextTick, watch } from 'vue';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';

// Utils
import { buildComponentTreeSignature } from '../../../core/utils/componentTree';

/**
 * Recomputes something after every change of the component tree of the canvas.
 *
 * The source is a signature of the tree rather than the list itself, because the store
 * mutates in place: `push` in addComponent and `splice` in a move keep the reference,
 * a rearrangement made of two splices keeps the length as well, and a move into a layout
 * touches the flat list not at all — only `parent` and the `children` of the two sides.
 * What the signature covers, and what it deliberately leaves out, is at its own
 * declaration.
 *
 * The ResizeObserver of the container does not cover this: it sees the content grow, but
 * a shrink leaves it silent — the height already computed holds the container open
 * through `minHeight`.
 *
 * @param recompute - Called after the DOM has been updated.
 */
export function useCanvasComponentTreeWatch(recompute: () => void): void {
    const componentsStore = useComponentsStore();

    watch(
        () => buildComponentTreeSignature(componentsStore.components),
        () => {
            nextTick(recompute);
        }
    );
}
