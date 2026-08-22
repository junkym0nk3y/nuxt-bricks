/**
 * The file drop target of the media gallery: unfolding the overlay on a drag, the
 * counter of the dragged files, and the `drop` itself.
 *
 * Taken out of the gallery modal: that one assembles five surfaces at once and was
 * outgrowing the ceiling of an SFC. Here is everything only the target needs — the
 * safeguard against a stuck overlay included, the one the state owes its timer and
 * its cleanup to.
 */

// #region Imports
// Types
import type { IMediaGalleryFileDrop, IMediaGalleryFileDropOptions } from '../types/media';

// Utils
import { countDraggedFiles } from '../utils/draggedFiles';

// Vue
import { computed, onUnmounted, ref } from 'vue';
// #endregion

// #region Constants
/**
 * The ceiling of `dragover` silence after which a drag counts as over (ms).
 *
 * A second, not "something shorter and snappier": the browser repeats `dragover` on
 * the current target about three times a second even under a motionless cursor, and
 * a short ceiling would collapse the target under files that are still being held.
 * This is a safeguard rather than the main mechanism — an ordinary drag is closed by
 * `dragleave`.
 */
const DRAG_IDLE_TIMEOUT_MS = 1000;
// #endregion

/**
 * Assembles the state and the handlers of the file drop target.
 *
 * @param options - Where the dropped files are to be handed.
 * @returns State of the target and the handlers of the drag.
 */
export function useMediaGalleryFileDrop(
    options: IMediaGalleryFileDropOptions
): IMediaGalleryFileDrop {
    const draggedFileCount = ref(0);
    /** Depth of dragenter/dragleave — see `handleDragLeave` */
    const dragDepth = ref(0);
    let dragIdleTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * Whether the target accepts files right now. Asked on every event rather than
     * once at creation: the right arrives with the context of the request, and in a
     * build without SSR it gets there only after the first frame.
     *
     * The gate lives here rather than in the markup of the caller: without a
     * `preventDefault` on `dragover` the browser opens the dropped file in a
     * neighboring tab, and a "let go — and it uploads" overlay under a role with no
     * such right would promise an upload that the check before sending then silently
     * cuts off.
     */
    const isEnabled = (): boolean => options.isEnabled?.() ?? true;

    const isDraggingFiles = computed<boolean>(() => draggedFileCount.value > 0);

    /** Stops the watchdog of drag silence */
    function stopDragIdleWatchdog(): void {
        if (dragIdleTimer !== null) {
            clearTimeout(dragIdleTimer);
            dragIdleTimer = null;
        }
    }

    /** Collapses the target and drops all of the drag state */
    function resetFileDrop(): void {
        stopDragIdleWatchdog();
        dragDepth.value = 0;
        draggedFileCount.value = 0;
    }

    /**
     * Restarts the watchdog of drag silence.
     *
     * `dragover` keeps arriving for as long as the cursor with the files is over the
     * target, so its disappearance is the one reliable sign that the drag is over.
     * The `dragenter`/`dragleave` pairs are not enough for that: they get lost (the
     * drag was called off with Escape, the `drop` landed in someone else's handler,
     * the element under the cursor vanished along with a repaint of the grid), and
     * the depth then stayed positive — the overlay of the target stuck over the grid
     * until the next opening of the gallery. `dragend` does not close that hole: for
     * files coming from the OS the source of the drag lies outside the document, and
     * the event does not arise in it.
     */
    function restartDragIdleWatchdog(): void {
        stopDragIdleWatchdog();
        dragIdleTimer = setTimeout(resetFileDrop, DRAG_IDLE_TIMEOUT_MS);
    }

    /**
     * Keeps `drop` switched on: without a `preventDefault` on `dragover` the browser
     * opens the file in a neighboring tab instead of handing it to the modal.
     *
     * @param event - The drag event.
     */
    function handleDragOver(event: DragEvent): void {
        // `preventDefault` goes BEFORE the gate of the role and regardless of it:
        // it does not allow an upload, it takes the native handling of the file away
        // from the browser. Without it the document opens the dropped file in a
        // neighboring tab — that is, a role with no right to write would get not
        // "nothing happened" but a departure from the page
        event.preventDefault();

        if (!isEnabled()) {
            return;
        }

        // The watchdog is only needed while the target is unfolded: over text and
        // links it would create a timer on every move of the cursor for nothing
        if (draggedFileCount.value > 0) {
            restartDragIdleWatchdog();
        }
    }

    /**
     * Unfolds the target and remembers how many files are being dragged.
     *
     * Only the entries with `kind === 'file'` count: selected text and a dragged link
     * land in `items` too, and counting those unfolded the target over something
     * `drop` cannot accept, after which it silently did nothing. Zero files
     * leave the target collapsed — `isDraggingFiles` is read off that same counter.
     *
     * @param event - The drag event.
     */
    function handleDragEnter(event: DragEvent): void {
        event.preventDefault();

        if (!isEnabled()) {
            return;
        }

        dragDepth.value += 1;
        draggedFileCount.value = countDraggedFiles(event.dataTransfer);

        if (draggedFileCount.value > 0) {
            restartDragIdleWatchdog();
        }
    }

    /**
     * Collapses the target.
     *
     * A depth is counted rather than a flag simply cleared: `dragleave` arrives on a
     * move of the cursor onto a child element as well, and without the counter the
     * target would blink on every tile the cursor passes.
     */
    function handleDragLeave(): void {
        dragDepth.value = Math.max(0, dragDepth.value - 1);

        if (dragDepth.value === 0) {
            resetFileDrop();
        }
    }

    /**
     * Takes the dropped files.
     *
     * @param event - The drop event.
     */
    function handleDrop(event: DragEvent): void {
        // The same order as in `dragover`: the dropped file is always swallowed
        // first, and the right decides after that
        event.preventDefault();

        if (!isEnabled()) {
            return;
        }

        resetFileDrop();

        const files = event.dataTransfer?.files;

        if (!files || files.length === 0) {
            return;
        }

        options.onFiles(Array.from(files));
    }

    // The timer has to leave along with the component: the mount latch does not
    // unmount the gallery, but a reset of the builder session does
    onUnmounted(() => {
        stopDragIdleWatchdog();
    });

    return {
        draggedFileCount,
        isDraggingFiles,
        handleDragOver,
        handleDragEnter,
        handleDragLeave,
        handleDrop,
        resetFileDrop,
    };
}
