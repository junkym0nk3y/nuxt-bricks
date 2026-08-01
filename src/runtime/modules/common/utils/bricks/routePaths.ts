/**
 * Единый источник путей поверхностей bricks: префиксы билдера и превью
 * (`bricks.routes` в nuxt.config, runtime — `runtimeConfig.public.bricksRoutes`)
 * и работа с `app.baseURL`.
 *
 * Используется build-time (module.ts — регистрация страниц и валидация),
 * сервером (auth-матрица, редирект на login) и клиентом
 * (`useBricksRoutePaths`, гейт плагинов билдера). Захардкоженные `/bricks`
 * и `/preview` в новом коде запрещены — только эти хелперы.
 */

import { PREVIEW_VERSION_QUERY_PARAM } from './previewRoute';

/** Префиксы маршрутов поверхностей bricks. */
export interface IBricksRoutePrefixes {
    /** Префикс билдера: дашборд `<prefix>`, редактор `<prefix>/:pagename`. */
    builderPrefix: string;
    /** Префикс превью рендера: `<prefix>/:pagename`. */
    previewPrefix: string;
}

/** Дефолтные префиксы (исторические пути модуля). */
export const DEFAULT_BRICKS_ROUTE_PREFIXES: IBricksRoutePrefixes = {
    builderPrefix: '/bricks',
    previewPrefix: '/preview',
};

/** Формат префикса: ведущий `/`, lowercase-сегменты, без trailing slash. */
const ROUTE_PREFIX_PATTERN = /^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/;

/** Корневые сегменты, зарезервированные другими поверхностями модуля/Nuxt. */
const RESERVED_ROOT_SEGMENTS = ['api', '_nuxt', '__nuxt_error'];

/**
 * Путь принадлежит поддереву префикса (сам префикс или `<prefix>/**`).
 *
 * @param prefix - Префикс без trailing slash.
 * @param pathname - Проверяемый путь.
 */
function matchesPathPrefix(prefix: string, pathname: string): boolean {
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Валидирует один префикс; кидает с именем опции — fail-fast при старте модуля.
 *
 * @param name - Имя опции для сообщения об ошибке.
 * @param prefix - Значение префикса.
 */
function validateRoutePrefix(name: string, prefix: string): void {
    if (!ROUTE_PREFIX_PATTERN.test(prefix)) {
        throw new Error(
            `[nuxt-bricks] Invalid bricks.routes.${name}: "${prefix}". ` +
                'Expected a leading "/", lowercase [a-z0-9-] segments and no trailing slash (e.g. "/admin/builder").'
        );
    }

    const rootSegment = prefix.split('/')[1];

    if (RESERVED_ROOT_SEGMENTS.includes(rootSegment)) {
        throw new Error(
            `[nuxt-bricks] Invalid bricks.routes.${name}: "${prefix}" — root segment "/${rootSegment}" is reserved.`
        );
    }
}

/**
 * Валидирует пару префиксов: формат каждого + отсутствие пересечения
 * (равенство или вложенность ломает и роутинг, и auth-матрицу).
 * Кидает Error — module.ts вызывает это в setup, ошибка валит сборку.
 *
 * @param prefixes - Префиксы из опций модуля.
 */
export function validateBricksRoutePrefixes(prefixes: IBricksRoutePrefixes): void {
    validateRoutePrefix('builderPrefix', prefixes.builderPrefix);
    validateRoutePrefix('previewPrefix', prefixes.previewPrefix);

    if (
        matchesPathPrefix(prefixes.builderPrefix, prefixes.previewPrefix) ||
        matchesPathPrefix(prefixes.previewPrefix, prefixes.builderPrefix)
    ) {
        throw new Error(
            `[nuxt-bricks] bricks.routes.builderPrefix ("${prefixes.builderPrefix}") and previewPrefix ("${prefixes.previewPrefix}") must not overlap.`
        );
    }
}

/**
 * Путь страницы логина database-auth.
 *
 * @param prefixes - Активные префиксы.
 */
export function getBuilderLoginPath(prefixes: IBricksRoutePrefixes): string {
    return `${prefixes.builderPrefix}/login`;
}

/**
 * Путь превью страницы; с `versionId` — превью сохранённой версии.
 *
 * @param prefixes - Активные префиксы.
 * @param pagename - ЧПУ страницы.
 * @param versionId - Id версии для `?version=` (без него — текущее состояние).
 */
export function getPreviewPagePath(
    prefixes: IBricksRoutePrefixes,
    pagename: string,
    versionId?: number
): string {
    const path = `${prefixes.previewPrefix}/${pagename}`;

    return versionId === undefined
        ? path
        : `${path}?${PREVIEW_VERSION_QUERY_PARAM}=${encodeURIComponent(versionId)}`;
}

/**
 * Путь принадлежит поверхности билдера (`<builderPrefix>` и `<builderPrefix>/**`).
 *
 * @param prefixes - Активные префиксы.
 * @param pathname - Путь без baseURL.
 */
export function isBuilderPath(prefixes: IBricksRoutePrefixes, pathname: string): boolean {
    return matchesPathPrefix(prefixes.builderPrefix, pathname);
}

/**
 * Путь — HTML-страница билдера или превью (выбор redirect-vs-401 в auth).
 *
 * @param prefixes - Активные префиксы.
 * @param pathname - Путь без baseURL.
 */
export function isProtectedBricksHtmlPath(
    prefixes: IBricksRoutePrefixes,
    pathname: string
): boolean {
    return (
        matchesPathPrefix(prefixes.builderPrefix, pathname) ||
        matchesPathPrefix(prefixes.previewPrefix, pathname)
    );
}

/**
 * Убирает `app.baseURL` из фактического pathname запроса → логический путь
 * роутера. Чужой путь (не под base) возвращается как есть.
 *
 * @param pathname - Фактический pathname (с base).
 * @param baseURL - `app.baseURL` (`/` — no-op).
 */
export function stripPathBase(pathname: string, baseURL: string): string {
    if (!baseURL || baseURL === '/') {
        return pathname;
    }

    const base = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;

    if (pathname === base) {
        return '/';
    }

    return pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : pathname;
}

/**
 * Добавляет `app.baseURL` к логическому пути — для `window.location` /
 * `window.open` / серверного redirect, где роутер Nuxt base не подставит.
 *
 * @param baseURL - `app.baseURL` (`/` — no-op).
 * @param path - Логический путь с ведущим `/`.
 */
export function joinPathBase(baseURL: string, path: string): string {
    if (!baseURL || baseURL === '/') {
        return path;
    }

    const base = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;

    return `${base}${path}`;
}
