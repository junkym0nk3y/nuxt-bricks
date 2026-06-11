/**
 * Bricks configuration types
 */

export interface IBricksBreakpoints {
    mobile: number;
    tablet: number;
    laptop: number;
    desktop: number;
    ultra: number;
}

export interface IBricksBreakpointConfig {
    width: number;
    aside?: string;
    minWidth?: string;
    maxWidth?: string;
    /** Базовый rem для viewport, напр. "10px" или "0.6944vw". Default: "10px" */
    remBase?: string;
}

export interface IBricksMediaConfig {
    maxUploadSizeMb?: number;
    maxVideoUploadSizeMb?: number;
    optimization?: {
        maxWidth?: number;
        quality?: number;
    };
}

export interface IBricksConfig {
    defaultFont?: string;
    fonts?: string[];
    backgroundColor?: string;
    layouts?: string[];
    nuxt4?: boolean;
    breakpoints?: {
        mobile?: IBricksBreakpointConfig;
        tablet?: IBricksBreakpointConfig;
        desktop?: IBricksBreakpointConfig;
    };
    media?: IBricksMediaConfig;
}

export interface IDeviceConfig {
    breakpoints: IBricksBreakpoints;
}

export interface IAppConfig {
    bricks?: {
        defaultFont?: string;
        fonts?: string[];
        backgroundColor?: string;
        layouts?: string[];
        nuxt4?: boolean;
        breakpoints?: {
            mobile?: IBricksBreakpointConfig;
            tablet?: IBricksBreakpointConfig;
            desktop?: IBricksBreakpointConfig;
        };
        media?: IBricksMediaConfig;
    };
    device?: {
        breakpoints?: IBricksBreakpoints;
    };
}

declare module '@nuxt/schema' {
    interface AppConfigInput {
        bricks?: IBricksConfig;
        device?: IDeviceConfig;
    }
}
