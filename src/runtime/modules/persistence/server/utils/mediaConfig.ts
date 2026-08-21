/**
 * The media upload settings: the size limits and the optimization parameters — out of
 * the app config and from the multipart form's fields, which override them for one
 * upload.
 *
 * Kept apart from `imageProcessing.ts` not only for the file's size: that one works
 * with pixels (sharp, the semaphore, the signatures), this one reads the configuration
 * and bounds UNTRUSTED input. Different reasons to change and different dependencies:
 * this module needs `useAppConfig`, that one needs sharp.
 */
import type { IMediaOptimizationRequestFields, IResolvedMediaConfig } from '../../types/media';
import { useAppConfig } from 'nitropack/runtime';
import type { IBricksMediaOptimization } from '../../../common/types/media';
import type { TBricksMediaImageFormat } from '../../../common/types/config';
import {
    DEFAULT_MEDIA_MAX_UPLOAD_SIZE_MB,
    DEFAULT_MEDIA_MAX_VIDEO_UPLOAD_SIZE_MB,
    DEFAULT_MEDIA_OPTIMIZATION,
    MEDIA_QUALITY_MAX,
    MEDIA_QUALITY_MIN,
    resolveConfiguredMaxWidth,
    resolveMediaMaxWidthBounds,
} from '../../../common/constants/mediaOptimization';

// #region Data
const BYTES_IN_MB = 1024 * 1024;
// #endregion

// #region Helpers
/**
 * Brings a value to a positive number, and returns the fallback otherwise.
 * @param value The raw value.
 * @param fallback The default value.
 */
function resolveNumber(value: unknown, fallback: number): number {
    const numericValue = Number(value);

    if (Number.isFinite(numericValue) && numericValue > 0) {
        return numericValue;
    }

    return fallback;
}

/**
 * Brings a value to a known format; an unknown one to the config's default.
 *
 * @param value The raw value (the config or a multipart form field).
 * @param fallback The default value.
 */
export function resolveImageFormat(
    value: unknown,
    fallback: TBricksMediaImageFormat
): TBricksMediaImageFormat {
    if (value === 'webp' || value === 'original') {
        return value;
    }

    return fallback;
}

/**
 * Brings the quality to what the encoder accepts.
 *
 * Applied always, the config included: sharp fails over a value outside 1..100, and a
 * typo in `bricks.media.optimization.quality` would bring any upload down instead of
 * giving a sensible result.
 *
 * @param quality The raw quality.
 */
function clampQuality(quality: number): number {
    return Math.min(Math.max(Math.round(quality), MEDIA_QUALITY_MIN), MEDIA_QUALITY_MAX);
}

/**
 * Brings a raw form field to a positive number.
 *
 * @param value The field's value, or undefined when there was no field.
 * @returns The number, or null — there was no override.
 */
function toRequestedNumber(value: string | undefined): number | null {
    if (typeof value !== 'string' || value.trim() === '') {
        return null;
    }

    const parsed = Number(value);

    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
// #endregion

/**
 * Parses the UNTRUSTED form fields and lays them over the config's defaults.
 *
 * The bounds are applied only to what actually arrived with the form: the popover's
 * field bounds the input, while a request bypassing the interface is not bounded by
 * it — a `maxWidth: 1` would store a "full" file one pixel wide. A value from the
 * config, taken when the field is absent, is not cut by the bounds: while this
 * function took an already merged object, there was nothing to tell one from the
 * other, and a `maxWidth: 12000` from the config silently became 8000.
 *
 * The request's own ceiling and floor are computed from the config too
 * (`resolveMediaMaxWidthBounds`): a value the developer chose as the default cannot be
 * unreachable for a request — the interface sends it verbatim.
 *
 * @param requested The raw multipart form fields.
 * @param fallback The parameters from the config (already resolved).
 * @returns The effective optimization parameters.
 */
export function resolveRequestedOptimization(
    requested: IMediaOptimizationRequestFields,
    fallback: IBricksMediaOptimization
): IBricksMediaOptimization {
    const requestedQuality = toRequestedNumber(requested.quality);
    const requestedMaxWidth = toRequestedNumber(requested.maxWidth);
    const maxWidthBounds = resolveMediaMaxWidthBounds(fallback.maxWidth);

    return {
        format: resolveImageFormat(requested.format, fallback.format),
        quality: requestedQuality === null ? fallback.quality : clampQuality(requestedQuality),
        maxWidth:
            requestedMaxWidth === null
                ? fallback.maxWidth
                : Math.min(
                      Math.max(Math.round(requestedMaxWidth), maxWidthBounds.min),
                      maxWidthBounds.max
                  ),
    };
}

/**
 * Reads the media settings (the limit and the optimization parameters) from the app
 * config, with defaults.
 */
export function resolveMediaConfig(): IResolvedMediaConfig {
    const appConfig = useAppConfig();
    const mediaConfig = appConfig.bricks?.media ?? {};
    const optimization = mediaConfig.optimization ?? {};
    const maxUploadSizeMb = resolveNumber(
        mediaConfig.maxUploadSizeMb,
        DEFAULT_MEDIA_MAX_UPLOAD_SIZE_MB
    );
    const maxVideoUploadSizeMb = resolveNumber(
        mediaConfig.maxVideoUploadSizeMb,
        DEFAULT_MEDIA_MAX_VIDEO_UPLOAD_SIZE_MB
    );

    return {
        maxUploadSizeBytes: maxUploadSizeMb * BYTES_IN_MB,
        maxUploadSizeMb,
        maxVideoUploadSizeBytes: maxVideoUploadSizeMb * BYTES_IN_MB,
        maxVideoUploadSizeMb,
        optimization: {
            format: resolveImageFormat(optimization.format, DEFAULT_MEDIA_OPTIMIZATION.format),
            quality: clampQuality(
                resolveNumber(optimization.quality, DEFAULT_MEDIA_OPTIMIZATION.quality)
            ),
            // The normalization is here rather than in the request's parsing: this
            // value is no longer subject to the request's bounds, and sharp accepts a
            // width only as a positive integer — a fractional `maxWidth` from the
            // config would bring the upload down
            maxWidth: resolveConfiguredMaxWidth(optimization.maxWidth),
        },
    };
}
