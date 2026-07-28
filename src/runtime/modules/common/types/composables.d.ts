/**
 * Возвращаемые значения composables домена `common`.
 */

import type { IBrickExportModule } from './index';
import type { IBricksBreakpoints, IBricksBreakpointConfig } from './config';
import type { IBricksRoutePrefixes } from '../utils/bricks/routePaths';

// #region useApiClient
/**
 * Возвращаемое значение `useApiClient`.
 */
export interface IUseApiClientReturn {
    /**
     * Инстанс Nitro-типизированного `$fetch`: тип выводится из
     * `globalThis.$fetch.create`, чтобы дженерики ответа (`apiFetcher<T>(…)`)
     * и типизация Nitro-роутов не терялись при явной аннотации.
     */
    apiFetcher: ReturnType<typeof globalThis.$fetch.create>;
}
// #endregion

// #region useBrickImports
/**
 * Возвращаемое значение `useBrickImports`.
 */
export interface IUseBrickImportsReturn {
    /**
     * Ищет loader brick-модуля по `brickPath` из схемы компонента.
     * `undefined` — layout-блок (brick-файла не имеет) либо промах по карте
     * загрузчиков.
     */
    findImportModule: (brickPath: string) => (() => Promise<IBrickExportModule>) | undefined;
}
// #endregion

// #region useBricksAssetUrl
/**
 * Возвращаемое значение `useBricksAssetUrl`.
 */
export interface IUseBricksAssetUrlReturn {
    /** `app.baseURL` приложения (`/` без конфигурации). */
    baseURL: string;
    /** URL публичного ассета модуля (`/_bricks/...`) с учётом `app.baseURL`. */
    resolveAssetUrl: (assetPath: string) => string;
}
// #endregion

// #region useBricksConfig
/**
 * Возвращаемое значение `useBricksConfig`: конфигурация лендинга с
 * подставленными дефолтами.
 */
export interface IUseBricksConfigReturn {
    /** Шрифт по умолчанию для контента страницы. */
    defaultFont: string;
    /** Дополнительные шрифты, объявленные потребителем (подключает он же). */
    fonts?: string[];
    /** Фон страницы. */
    backgroundColor: string;
    /** Доступные в билдере layout-блоки. */
    layouts: string[];
    /** Device breakpoints приложения — база media queries published-страницы. */
    breakpoints: IBricksBreakpoints;
    /** Геометрия трёх viewport'ов канваса (ширина + боковые отступы). */
    canvasBreakpoints: {
        mobile: IBricksBreakpointConfig;
        tablet: IBricksBreakpointConfig;
        desktop: IBricksBreakpointConfig;
    };
}
// #endregion

// #region useBricksRoutePaths
/**
 * Возвращаемое значение `useBricksRoutePaths`.
 */
export interface IUseBricksRoutePathsReturn {
    /** Активные префиксы маршрутов. */
    prefixes: IBricksRoutePrefixes;
    /** Логический путь дашборда билдера (без baseURL). */
    builderRootPath: string;
    /** Логический путь страницы логина (без baseURL). */
    builderLoginPath: string;
    /** Логический путь превью страницы (без baseURL). */
    previewPagePath: (pagename: string) => string;
    /** Добавляет `app.baseURL` — для `window.location`/`window.open`/`<a href>`. */
    withBase: (path: string) => string;
    /** Убирает `app.baseURL` из фактического pathname. */
    stripBase: (pathname: string) => string;
    /** Путь принадлежит поверхности билдера. */
    isBuilderPath: (pathname: string) => boolean;
}
// #endregion
