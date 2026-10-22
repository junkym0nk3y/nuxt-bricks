/**
 * Bricks configuration types
 */

/**
 * Target format of the full file on upload. `original` — store it as it is; it
 * applies to web-safe inputs only, for HEIC/TIFF/BMP the conversion stays mandatory
 * (otherwise progressive loading would replace the visible preview with a file the
 * browser will not open).
 */
export type TBricksMediaImageFormat = 'webp' | 'original';

/**
 * Progressive loading mode of an image. `off` — the full file right away;
 * `two-step` — the preview, then the full file; `three-step` — the mock, the
 * preview, the full file. The global default lives here and a Media block overrides
 * it: the mode depends on the place on the page (the first screen versus the footer)
 * rather than on the file.
 */
export type TBricksMediaLoadMode = 'off' | 'two-step' | 'three-step';

export interface IBricksMediaConfig {
    maxUploadSizeMb?: number;
    maxVideoUploadSizeMb?: number;
    optimization?: {
        format?: TBricksMediaImageFormat;
        maxWidth?: number;
        quality?: number;
    };
    /** Default progressive loading mode for the Media blocks. Default: 'two-step' */
    loadMode?: TBricksMediaLoadMode;
}

/**
 * Runtime configuration of the landing.
 *
 * The device set is not here: the former `bricks.breakpoints` (canvas widths) and
 * `device.breakpoints` (media-query thresholds) were two unconnected knobs and did
 * manage to drift apart — the `laptop` step declared among the thresholds never
 * reached the CSS generation at all. They were replaced by a single build-time module
 * option, `bricks.devices`: it feeds both the runtime and the SCSS map of the mixins,
 * whereas app.config does not reach the mixins by the time they are built.
 */
export interface IBricksConfig {
    defaultFont?: string;
    fonts?: string[];
    backgroundColor?: string;
    layouts?: string[];
    nuxt4?: boolean;
    media?: IBricksMediaConfig;
}

export interface IAppConfig {
    bricks?: IBricksConfig;
}

declare module '@nuxt/schema' {
    interface AppConfigInput {
        bricks?: IBricksConfig;
    }
}
