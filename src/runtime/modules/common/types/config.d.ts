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

/**
 * Целевой формат полного файла при загрузке. `original` — сохранить как есть;
 * применяется только к web-safe входам, для HEIC/TIFF/BMP конвертация остаётся
 * обязательной (иначе постепенная загрузка подменила бы видимое превью файлом,
 * который браузер не откроет).
 */
export type TBricksMediaImageFormat = 'webp' | 'original';

/**
 * Режим постепенной загрузки изображения. `off` — сразу полный файл;
 * `two-step` — превью, затем полный; `three-step` — mock, превью, полный.
 * Глобальный дефолт живёт здесь, блок Media его переопределяет: режим зависит
 * от места на странице (первый экран против подвала), а не от файла.
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
    /** Дефолтный режим постепенной загрузки для блоков Media. Default: 'two-step'. */
    loadMode?: TBricksMediaLoadMode;
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
