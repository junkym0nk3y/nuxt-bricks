/**
 * Defaults and bounds of media optimization — one source for the client and the
 * server.
 *
 * These numbers used to live as three copies: in the server-side
 * `imageProcessing.ts`, in the client-side `useMediaUpload.ts` and as a literal in
 * the gallery modal. A divergence would have been invisible and one-directional:
 * the popover would keep showing the old value AND sending it in the multipart
 * form, that is, a new server-side default simply would not take effect for
 * uploads from the gallery. The same goes for the size limits — the client would
 * reject the file by its own former ceiling without ever letting the request reach
 * the server.
 */

// Types
import type { IBricksMediaOptimization, IMediaMaxWidthBounds } from '../types/media';

/** Default size ceiling of an image (MB) */
export const DEFAULT_MEDIA_MAX_UPLOAD_SIZE_MB = 10;

/** Default size ceiling of a video (MB) — videos are not optimized */
export const DEFAULT_MEDIA_MAX_VIDEO_UPLOAD_SIZE_MB = 100;

/** Default optimization parameters; overridden by `bricks.media.optimization` */
export const DEFAULT_MEDIA_OPTIMIZATION: IBricksMediaOptimization = {
    format: 'webp',
    quality: 70,
    maxWidth: 1920,
};

/**
 * Bounds of the parameter input field — and therefore the bounds of the request.
 *
 * Shared with the server rather than "client-side": the popover field constrains
 * the input, while the upload endpoint constrains a request that bypasses the
 * interface. As long as the bounds lived in the component alone, a `maxWidth: 1`
 * from a crafted request went through, and the "full" file was stored one pixel
 * wide.
 *
 * The quality is always clamped, the config included: outside 1..100 the encoder
 * itself fails. The width is not — see `resolveMediaMaxWidthBounds`.
 */
export const MEDIA_QUALITY_MIN = 1;
export const MEDIA_QUALITY_MAX = 100;
// Not exported: the width is exposed only through `resolveMediaMaxWidthBounds`. A
// bare constant next to it would read as a ready-made bound, whereas the config
// widens these numbers — a consumer taking the constant directly would clamp the
// configured width all over again
const MEDIA_MAX_WIDTH_MIN = 16;
const MEDIA_MAX_WIDTH_MAX = 8000;

/**
 * Brings `bricks.media.optimization.maxWidth` to a usable width in pixels.
 *
 * The single normalization of the configured width for both the client and the
 * server: both sides compute the bounds of the field from it, and the moment they
 * normalized the value differently they drifted apart — the client returned
 * `min: 0` and the server `min: 16`.
 *
 * A value below one pixel is not a width but a typo, and falls back to the
 * default: rounding would give a zero, while `sharp` only accepts a positive
 * integer, that is, the upload would fail on every file. Small but meaningful
 * values are preserved nonetheless: `8` stays an eight, the ceiling of an input
 * field is no law for the config.
 *
 * @param value - Raw value from the module config.
 * @returns A positive integer width.
 */
export function resolveConfiguredMaxWidth(value: unknown): number {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed < 1) {
        return DEFAULT_MEDIA_OPTIMIZATION.maxWidth;
    }

    return Math.round(parsed);
}

/**
 * Computes the effective bounds of the "maximum width" from the value in the
 * config.
 *
 * The config is set by a developer, and there is nothing to clamp their deliberate
 * choice with a ceiling invented for an input field: a value from there does not
 * narrow the bounds but widens them — in both directions, otherwise a
 * `maxWidth: 8` from the config would turn into 16 while 12000 would be kept as
 * is.
 *
 * The formula is deliberately shared by the client and the server. As long as the
 * ceiling was a constant, a `maxWidth: 12000` from the config lived exactly until
 * the first upload: the popover showed 12000 and sent it in the form, the field
 * collapsed the value down to 8000 on blur, and the endpoint did the same on every
 * upload, that is, the setting did not work at all.
 *
 * @param configuredMaxWidth - Value of `bricks.media.optimization.maxWidth`.
 * @returns Bounds for the input field and for the validation of a request.
 */
export function resolveMediaMaxWidthBounds(configuredMaxWidth: number): IMediaMaxWidthBounds {
    const configured = resolveConfiguredMaxWidth(configuredMaxWidth);

    return {
        min: Math.min(MEDIA_MAX_WIDTH_MIN, configured),
        max: Math.max(MEDIA_MAX_WIDTH_MAX, configured),
    };
}
