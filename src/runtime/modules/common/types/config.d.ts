/**
 * Bricks configuration types
 */

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

/**
 * Рантайм-конфигурация лендинга.
 *
 * Набора устройств здесь нет: прежние `bricks.breakpoints` (ширины канваса) и
 * `device.breakpoints` (пороги media-query) были двумя несвязанными ручками и
 * успели разойтись — объявленная в порогах ступень `laptop` в генерацию CSS не
 * попадала вовсе. Их заменила одна build-time опция модуля `bricks.devices`:
 * она кормит и рантайм, и SCSS-карту миксинов, а app.config до сборки миксинов
 * не доезжает.
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
