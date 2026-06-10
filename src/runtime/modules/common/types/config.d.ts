/**
 * Landing configuration types
 */

export interface ILandingBreakpoints {
    mobile: number;
    tablet: number;
    laptop: number;
    desktop: number;
    ultra: number;
}

export interface ILandingBreakpointConfig {
    width: number;
    aside?: string;
    minWidth?: string;
    maxWidth?: string;
    /** Базовый rem для viewport, напр. "10px" или "0.6944vw". Default: "10px" */
    remBase?: string;
    /** Переопределить проектный .container на published-странице значениями aside/maxWidth */
    overrideContainer?: boolean;
}

export interface ILandingMediaConfig {
    maxUploadSizeMb?: number;
    maxVideoUploadSizeMb?: number;
    optimization?: {
        maxWidth?: number;
        quality?: number;
    };
}

export interface ILandingConfig {
    defaultFont?: string;
    fonts?: string[];
    backgroundColor?: string;
    layouts?: string[];
    nuxt4?: boolean;
    breakpoints?: {
        mobile?: ILandingBreakpointConfig;
        tablet?: ILandingBreakpointConfig;
        desktop?: ILandingBreakpointConfig;
    };
    media?: ILandingMediaConfig;
}

export interface IDeviceConfig {
    breakpoints: ILandingBreakpoints;
}

export interface IAppConfig {
    landing?: {
        defaultFont?: string;
        fonts?: string[];
        backgroundColor?: string;
        layouts?: string[];
        nuxt4?: boolean;
        breakpoints?: {
            mobile?: ILandingBreakpointConfig;
            tablet?: ILandingBreakpointConfig;
            desktop?: ILandingBreakpointConfig;
        };
        media?: ILandingMediaConfig;
    };
    device?: {
        breakpoints?: ILandingBreakpoints;
    };
}

declare module '@nuxt/schema' {
    interface AppConfigInput {
        landing?: ILandingConfig;
        device?: IDeviceConfig;
    }
}
