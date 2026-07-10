// #region Imports
// Utils
import {
    DEFAULT_BRICKS_ROUTE_PREFIXES,
    getBuilderLoginPath,
    getPreviewPagePath,
    isBuilderPath,
    joinPathBase,
    stripPathBase,
    type IBricksRoutePrefixes,
} from '../utils/bricks/routePaths';

// Nuxt
import { useRuntimeConfig } from '#imports';
// #endregion

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

/**
 * Пути поверхностей bricks с учётом `bricks.routes` и `app.baseURL`.
 *
 * Для переходов внутри Vue Router предпочтительны именованные роуты
 * (`bricks-builder-index`, `bricks-builder-pagename`, `bricks-preview`) —
 * они не зависят ни от префиксов, ни от base. Композабл нужен там, где
 * требуется строковый путь: `window.location`, `window.open`, `<a href>`,
 * сравнение с `location.pathname`.
 */
export function useBricksRoutePaths(): IUseBricksRoutePathsReturn {
    const config = useRuntimeConfig();
    const prefixes =
        (config.public.bricksRoutes as IBricksRoutePrefixes | undefined) ??
        DEFAULT_BRICKS_ROUTE_PREFIXES;
    const baseURL = (config.app?.baseURL as string | undefined) || '/';

    return {
        prefixes,
        builderRootPath: prefixes.builderPrefix,
        builderLoginPath: getBuilderLoginPath(prefixes),
        previewPagePath: (pagename: string) => getPreviewPagePath(prefixes, pagename),
        withBase: (path: string) => joinPathBase(baseURL, path),
        stripBase: (pathname: string) => stripPathBase(pathname, baseURL),
        isBuilderPath: (pathname: string) => isBuilderPath(prefixes, pathname),
    };
}
