// #region Imports
// Types
import type { IAuthAvatarCropFrame } from '../types/auth';
// #endregion

// #region Constants
/**
 * Minimum frame side in pixels of the source image — the same bound the upload
 * endpoint has (`users/me/avatar.post.ts`). The copy here is not for a check (the
 * server does that) but for the zoom ceiling: a slider taking the side below this
 * number would be preparing a guaranteed refusal.
 */
export const AUTH_AVATAR_MIN_CROP_SIDE_PX = 32;

/**
 * Diameter of the cropping circle on screen (px).
 *
 * One value for the markup and for the arithmetic of the preview: CSS draws the
 * circle while the composable converts source pixels into screen pixels, and once
 * drifted apart they would show a person an area other than the one traveling to
 * the server. The frame going into the request does not depend on this number at
 * all — it lives in pixels of the source image.
 *
 * The preview stage equals this circle and is therefore square: at the minimum zoom
 * the shorter side of the photo covers the circle exactly, that is, the photo fills
 * the stage whole instead of hanging as a stripe inside a wide rectangle. A wide
 * stage would require scaling the preview differently from how the frame is
 * computed — and a person would crop one area while getting another.
 */
export const AUTH_AVATAR_CROP_CIRCLE_PX = 280;
// #endregion

/**
 * Zoom ceiling for a photo: beyond it the frame side goes below the server minimum.
 *
 * @param width - Width of the oriented image.
 * @param height - Height of the oriented image.
 * @returns Largest zoom value (never below 1).
 */
export function resolveMaxCropZoom(width: number, height: number): number {
    const shortestSide = Math.min(width, height);

    return Math.max(1, shortestSide / AUTH_AVATAR_MIN_CROP_SIDE_PX);
}

/**
 * Whether the photo can be cropped at all.
 *
 * Below the minimum side this is not cropping but stretching a few pixels up to
 * 256: the result is unreadable while the reason is opaque to a person, so such a
 * file is refused as soon as it is decoded — the stage stays empty and the modal
 * shows the reason in place of a picture.
 *
 * @param width - Width of the oriented image.
 * @param height - Height of the oriented image.
 * @returns The photo is suitable for cropping.
 */
export function isCroppableImage(width: number, height: number): boolean {
    return Math.min(width, height) >= AUTH_AVATAR_MIN_CROP_SIDE_PX;
}

/**
 * Computes the cropping frame out of the zoom and the offset of the photo.
 *
 * The invariants of the frame are held by the ORDER of the operations rather than
 * by a check at the end: the side is rounded down and clipped by the shorter side
 * of the photo, and only then are the coordinates clamped — which is why
 * `left + side <= width` and `top + side <= height` hold by construction. Rounding
 * the side UP would give a frame a pixel past the edge, and that is the server
 * refusal "the frame is outside the image" on a legitimate crop.
 *
 * The offset is given in those same source pixels and means the position of the top
 * left corner of the frame. Values outside the photo are not a caller's mistake: a
 * gesture leads the finger freely, and keeping the frame inside is this function's
 * job.
 *
 * @param width - Width of the oriented image.
 * @param height - Height of the oriented image.
 * @param zoom - Zoom: 1 — the shorter side of the photo covers the frame exactly.
 * @param offsetLeft - Desired left bound of the frame in source pixels.
 * @param offsetTop - Desired top bound of the frame in source pixels.
 * @returns An integer frame inside the image.
 */
export function resolveCropFrame(
    width: number,
    height: number,
    zoom: number,
    offsetLeft: number,
    offsetTop: number
): IAuthAvatarCropFrame {
    const shortestSide = Math.min(width, height);
    const side = Math.min(Math.floor(shortestSide / Math.max(zoom, 1)), width, height);

    return {
        left: Math.round(clampCropOffset(offsetLeft, width - side)),
        top: Math.round(clampCropOffset(offsetTop, height - side)),
        side,
    };
}

/**
 * Clamps a frame coordinate within the allowed bounds, WITHOUT rounding.
 *
 * The fractional value is what the gesture needs: it accumulates the offset between
 * events, and rounding at every step would lose the remainder (at a strong zoom —
 * the whole step). Only `resolveCropFrame` rounds, on the way out, because integers
 * are required by the server rather than by the arithmetic of the gesture.
 *
 * @param value - Desired value.
 * @param max - Largest allowed value (`size - side`).
 * @returns The value within `[0, max]`.
 */
export function clampCropOffset(value: number, max: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.min(Math.max(value, 0), Math.max(max, 0));
}

/**
 * Centers a frame of the given side inside the image.
 *
 * @param width - Width of the oriented image.
 * @param height - Height of the oriented image.
 * @param side - Side of the frame.
 * @returns Offset of the top left corner of the frame.
 */
export function resolveCenteredOffset(
    width: number,
    height: number,
    side: number
): { left: number; top: number } {
    return {
        left: (width - side) / 2,
        top: (height - side) / 2,
    };
}
