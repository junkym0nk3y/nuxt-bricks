// #region Imports
// Types
import type { IAuthAvatarCropFrame, IUseAuthAvatarCropReturn } from '../types/auth';

// Utils
import {
    AUTH_AVATAR_CROP_CIRCLE_PX,
    clampCropOffset,
    isCroppableImage,
    resolveCenteredOffset,
    resolveCropFrame,
    resolveMaxCropZoom,
} from '../utils/avatarCropFrame';

// Vue
import { computed, onUnmounted, ref, watch } from 'vue';
// #endregion

/**
 * Cropping of the profile photo: the decoding of the selected file, the zoom, the
 * offset and the frame in the coordinates of the source image.
 *
 * The dimensions are taken off the decoded `<img>` (`naturalWidth`/`naturalHeight`),
 * and that is not "whichever is easier": the browser applies the EXIF orientation on
 * its own (`image-orientation: from-image` is the initial value), so its dimensions
 * match what the server sees, which reads them out of `metadata().autoOrient`. Judged
 * by the unrotated bytes, a legitimate frame of a photo taken in portrait would be
 * rejected as going past the edge.
 *
 * The object URL is always revoked — on the closing, on the next file and on the
 * unmount: the builder lives for the whole session, the modal is opened many times,
 * and a blob of up to 5 MB per open would stay in the memory of the document until a
 * reload.
 *
 * @returns State of the cropping and the operations over it.
 */
export function useAuthAvatarCrop(): IUseAuthAvatarCropReturn {
    // #region Data
    const imageUrl = ref<string | null>(null);
    const zoom = ref(1);
    /** Dimensions of the oriented image; zeros — there is no file yet. */
    const naturalWidth = ref(0);
    const naturalHeight = ref(0);
    /**
     * Offset of the top left corner of the frame in source pixels — FRACTIONAL.
     *
     * The rounding lives in `resolveCropFrame` only, on the way out. Count the
     * gesture off the rounded frame and the fractional remainder would be lost at
     * every event: at a strong zoom one screen pixel is less than half a source
     * pixel, and slow dragging would not move the frame at all, while at other zooms
     * the systematic rounding up would take the frame away faster than the cursor.
     */
    const offsetLeft = ref(0);
    const offsetTop = ref(0);
    /**
     * Number of the file open: the decoding is asynchronous, and the second selected
     * file may resolve earlier than the first. Without the comparison the state would
     * keep the dimensions of one photo while another is shown — that is, the frame
     * would travel to the server for the wrong file, and the object URL of the late
     * one would leak.
     */
    let openGeneration = 0;
    // #endregion

    // #region Computed
    const isReady = computed<boolean>(() => naturalWidth.value > 0 && naturalHeight.value > 0);

    const maxZoom = computed<number>(() =>
        isReady.value ? resolveMaxCropZoom(naturalWidth.value, naturalHeight.value) : 1
    );

    const frame = computed<IAuthAvatarCropFrame | null>(() => {
        if (!isReady.value) {
            return null;
        }

        return resolveCropFrame(
            naturalWidth.value,
            naturalHeight.value,
            zoom.value,
            offsetLeft.value,
            offsetTop.value
        );
    });

    /**
     * The preview of the photo under the circle: the zoom converts source pixels into
     * screen pixels, the offset puts the frame into the center of the circle. It is
     * computed off the same frame that travels to the server — otherwise a person
     * would crop one thing and get another.
     */
    const imageStyle = computed<Record<string, string>>(() => {
        const current = frame.value;
        const style: Record<string, string> = {};

        if (!current) {
            return style;
        }

        const scale = AUTH_AVATAR_CROP_CIRCLE_PX / current.side;

        style.width = `${naturalWidth.value * scale}px`;
        style.height = `${naturalHeight.value * scale}px`;
        style.transform = `translate(${-current.left * scale}px, ${-current.top * scale}px)`;

        return style;
    });
    // #endregion

    // #region Methods
    /**
     * Releases the object URL and resets the state.
     */
    function release(): void {
        // A decoding already started is invalidated: its result belongs to a file
        // that is no longer on the screen
        openGeneration += 1;

        if (imageUrl.value) {
            URL.revokeObjectURL(imageUrl.value);
        }

        imageUrl.value = null;
        naturalWidth.value = 0;
        naturalHeight.value = 0;
        offsetLeft.value = 0;
        offsetTop.value = 0;
        zoom.value = 1;
    }

    /**
     * Decodes the file and sets the initial cropping to the center.
     *
     * A decoding failure is rethrown outwards: to show "select an area" on an empty
     * stage is to invite a person to crop what the browser never read. A photo that
     * is too small is rejected right here: the server would refuse it anyway, and
     * enlarging thirty pixels up to 256 makes no sense.
     *
     * @param file - Selected file of the photo.
     */
    async function openFile(file: File): Promise<void> {
        release();

        // The generation belongs to THIS opening: `release` has just raised it, and a
        // second raise would only make the counter run twice as fast as the openings
        const generation = openGeneration;
        const url = URL.createObjectURL(file);
        const image = new Image();

        image.src = url;

        try {
            await image.decode();
        } catch (error: unknown) {
            URL.revokeObjectURL(url);

            throw error;
        }

        // While we were decoding, another file was selected (or the modal was
        // closed): this photo is no longer the one on the screen
        if (generation !== openGeneration) {
            URL.revokeObjectURL(url);

            return;
        }

        if (!isCroppableImage(image.naturalWidth, image.naturalHeight)) {
            URL.revokeObjectURL(url);

            throw new RangeError('Image is too small to crop');
        }

        imageUrl.value = url;
        naturalWidth.value = image.naturalWidth;
        naturalHeight.value = image.naturalHeight;
        zoom.value = 1;

        const side = Math.min(image.naturalWidth, image.naturalHeight);
        const centered = resolveCenteredOffset(image.naturalWidth, image.naturalHeight, side);

        offsetLeft.value = centered.left;
        offsetTop.value = centered.top;
    }

    /**
     * Moves the photo under the circle.
     *
     * The delta arrives in screen pixels and is converted into source pixels: the
     * frame lives in them, and the gesture has to move it by exactly as much as the
     * finger traveled. The sign is inverted — the photo is what is dragged, while
     * the frame stays put.
     *
     * FRACTIONAL state is what accumulates rather than the rounded frame: otherwise a
     * step below half a source pixel would be dropped whole (at a strong zoom that is
     * any calm movement of the mouse), while a step above half would be rounded up,
     * and the frame would travel faster than the cursor.
     *
     * The clamp here is mandatory: without it going past the edge would accumulate a
     * "debt" in the fractional state, and the frame would not travel back until that
     * debt is worked off.
     *
     * @param deltaX - Horizontal cursor delta (screen px).
     * @param deltaY - Vertical cursor delta (screen px).
     */
    function dragBy(deltaX: number, deltaY: number): void {
        const current = frame.value;

        if (!current) {
            return;
        }

        const scale = AUTH_AVATAR_CROP_CIRCLE_PX / current.side;

        offsetLeft.value = clampCropOffset(
            offsetLeft.value - deltaX / scale,
            naturalWidth.value - current.side
        );
        offsetTop.value = clampCropOffset(
            offsetTop.value - deltaY / scale,
            naturalHeight.value - current.side
        );
    }
    // #endregion

    // #region Lifecycle
    // The zoom holds on to the CENTER of the selected area rather than to its top
    // left corner: the corner would let the center travel up and to the left, that is,
    // an aimed face would leave the circle at every movement of the slider — and
    // bringing it back would only be possible by dragging
    watch(zoom, (nextZoom, previousZoom) => {
        const current = frame.value;

        if (!current || !isReady.value || nextZoom === previousZoom) {
            return;
        }

        const previousSide = resolveCropFrame(
            naturalWidth.value,
            naturalHeight.value,
            previousZoom,
            offsetLeft.value,
            offsetTop.value
        ).side;
        const shift = (previousSide - current.side) / 2;

        offsetLeft.value = clampCropOffset(
            offsetLeft.value + shift,
            naturalWidth.value - current.side
        );
        offsetTop.value = clampCropOffset(
            offsetTop.value + shift,
            naturalHeight.value - current.side
        );
    });

    onUnmounted(() => {
        release();
    });
    // #endregion

    return {
        imageUrl,
        zoom,
        maxZoom,
        imageStyle,
        frame,
        isReady,
        openFile,
        dragBy,
        release,
    };
}
