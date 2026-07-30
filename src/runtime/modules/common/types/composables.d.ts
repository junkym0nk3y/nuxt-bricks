/**
 * Возвращаемые значения composables домена `common`.
 */

import type { IBrickExportModule } from './index';
import type { IBricksBreakpoints, IBricksBreakpointConfig } from './config';
import type { IBricksRoutePrefixes } from '../utils/bricks/routePaths';

// #region useApiClient
/**
 * Инстанс ofetch, на котором построен клиент билдера. Тип берётся из
 * `globalThis.$fetch.create`, чтобы форма опций не разъезжалась с транспортом.
 */
type TRawApiFetcher = ReturnType<typeof globalThis.$fetch.create>;

/** Опции одного запроса клиента билдера. */
export type TApiRequestOptions = NonNullable<Parameters<TRawApiFetcher>[1]>;

/**
 * Фетчер API билдера.
 *
 * Это обёртка над инстансом ofetch, а не сам инстанс: потолок ожидания ставится
 * до вызова, чтобы обрыв по нему можно было опознать на выходе (в браузере
 * платформа теряет причину аборта на фазе чтения тела —
 * см. `normalizeRequestAbortError`). Цена обёртки — Nitro-типизация роутов по
 * URL здесь не выводится; дженерик ответа задаётся на вызове.
 */
export interface IApiFetcher {
    <T = unknown>(request: string, options?: TApiRequestOptions): Promise<T>;
}

/**
 * Возвращаемое значение `useApiClient`.
 */
export interface IUseApiClientReturn {
    /** Фетчер API билдера с потолком ожидания и опознаваемым обрывом. */
    apiFetcher: IApiFetcher;
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
