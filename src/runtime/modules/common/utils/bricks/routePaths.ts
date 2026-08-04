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

import type { IBricksPageAddress } from '../../types/pageAddress';
import { getPageAddressKey } from './pageAddress';
import { PREVIEW_VERSION_QUERY_PARAM } from './previewRoute';
import { BRICKS_BUILDER_PAGE_ROUTE_NAMES, BRICKS_ROUTE_NAMES } from '../../constants/routes';

/** Префиксы маршрутов поверхностей bricks. */
export interface IBricksRoutePrefixes {
    /** Префикс билдера: дашборд `<prefix>`, редактор `<prefix>/:pagename`. */
    builderPrefix: string;
    /** Префикс превью рендера: `<prefix>/:pagename`. */
    previewPrefix: string;
}

/**
 * Дефолтные префиксы. Все поверхности модуля сидят в неймспейсе `bricks-`
 * намеренно: каждый занятый префикс отбирает у потребителя published-адрес, а
 * `/preview` — слишком ходовой URL, чтобы забирать его под превью билдера.
 */
export const DEFAULT_BRICKS_ROUTE_PREFIXES: IBricksRoutePrefixes = {
    builderPrefix: '/bricks',
    previewPrefix: '/bricks-preview',
};

/**
 * Сегмент страницы логина внутри префикса билдера. Единый источник и для
 * регистрации маршрута, и для резервирования одноимённого pagename: разъехавшись,
 * они дали бы либо недостижимый редактор, либо запрет без причины.
 *
 * В неймспейсе `bricks-` по той же причине, что и префиксы: сегмент `login`
 * забирал бы у потребителя редактор его собственной страницы `/login`.
 */
export const BUILDER_LOGIN_SEGMENT = 'bricks-login';

/** Формат префикса: ведущий `/`, lowercase-сегменты, без trailing slash. */
const ROUTE_PREFIX_PATTERN = /^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/;

/** Корневые сегменты, зарезервированные другими поверхностями модуля/Nuxt. */
const RESERVED_ROOT_SEGMENTS = ['api', '_nuxt', '__nuxt_error'];

/** Маршруты, по которым published-страница и должна открываться. */
const PUBLISHED_PAGE_ROUTE_NAMES: readonly string[] = [
    BRICKS_ROUTE_NAMES.page,
    BRICKS_ROUTE_NAMES.pagePrefixed,
];

/**
 * Владелец пути, у которого нет строкового имени: у vue-router имя маршрута
 * необязательно и может быть `Symbol`. Такой маршрут адрес всё равно занимает,
 * поэтому резолвер обязан отличать его от «не сматчилось вовсе» — иначе
 * безымянная страница потребителя молча перекрыла бы published-адрес.
 */
export const UNNAMED_ROUTE_OWNER = '(unnamed route)';

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
 * Непустые сегменты пути: `/admin/builder` → `['admin', 'builder']`.
 *
 * @param path - Путь с ведущим `/`.
 */
function getPathSegments(path: string): string[] {
    return path.split('/').filter(Boolean);
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

    const rootSegment = getPathSegments(prefix)[0];

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
    return `${prefixes.builderPrefix}/${BUILDER_LOGIN_SEGMENT}`;
}

/**
 * Путь превью страницы; с `versionId` — превью сохранённой версии.
 *
 * Адресный, как и путь редактора: превью открывается из редактора конкретной
 * страницы, и по одному имени кнопка «Превью» у `/news/post` открывала бы
 * вкладку, которую билдер наполняет схемой `/blog/post`.
 *
 * @param prefixes - Активные префиксы.
 * @param address - Адрес страницы.
 * @param versionId - Id версии для `?version=` (без него — текущее состояние).
 */
export function getPreviewPagePath(
    prefixes: IBricksRoutePrefixes,
    address: IBricksPageAddress,
    versionId?: number
): string {
    const path = `${prefixes.previewPrefix}/${getPageAddressKey(address)}`;

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
 * Логический live-адрес published-страницы: `/<urlPrefix>/<pagename>` либо
 * `/<pagename>` без префикса.
 *
 * Выводится из канонического ключа адреса (`getPageAddressKey`), а не считает
 * сегменты сам: ключ адреса уже задаёт единственную сериализацию пары, и вторая
 * копия правила разошлась бы с ключами черновиков и payload'а на пробельном
 * префиксе.
 *
 * @param address - Адрес страницы.
 */
export function getPublishedPagePath(address: IBricksPageAddress): string {
    return `/${getPageAddressKey(address)}`;
}

/**
 * Статические (беспараметрические) маршруты, которые регистрирует сам модуль:
 * путь → имя роута. Выводится из тех же префиксов и сегментов, что и регистрация
 * страниц, поэтому разъехаться с ней не может.
 *
 * Нужна там, где живого роутера нет (сервер): дать `isPageAddressTaken` и
 * `isEditorAddressTaken` ответ «кто владеет этим путём» хотя бы по своим
 * поверхностям. Клиент вместо этого спрашивает роутер приложения и видит ещё и
 * страницы потребителя.
 *
 * @param prefixes - Активные префиксы.
 */
export function getBricksOwnStaticRoutes(prefixes: IBricksRoutePrefixes): Record<string, string> {
    return {
        [prefixes.builderPrefix]: BRICKS_ROUTE_NAMES.builderIndex,
        [getBuilderLoginPath(prefixes)]: BRICKS_ROUTE_NAMES.builderLogin,
    };
}

/**
 * Адрес занят чужим маршрутом.
 *
 * Вопрос задаётся роутингу («кто выигрывает этот путь»), а не списку имён:
 * список пришлось бы держать вручную, и он всё равно не знал бы о страницах
 * приложения-потребителя. `undefined` от резолвера — «статического владельца
 * нет», то есть путь достаётся ожидаемому маршруту.
 *
 * @param resolveRouteName - Имя маршрута, выигрывающего путь (undefined — никто).
 * @param path - Проверяемый путь.
 * @param expectedOwners - Маршруты, которым путь и должен достаться.
 */
function isPathTakenByOther(
    resolveRouteName: (path: string) => string | undefined,
    path: string,
    expectedOwners: readonly string[]
): boolean {
    const owner = resolveRouteName(path);

    return owner !== undefined && !expectedOwners.includes(owner);
}

/**
 * Live-адрес published-страницы недоступен: его либо выигрывает чужой маршрут,
 * либо он уходит под поверхность bricks целиком.
 *
 * Две причины проверяются отдельно, потому что вторая маршрутом не видна:
 * `<previewPrefix>` сам по себе маршрута не имеет (превью живёт на
 * `<prefix>/:pagename`), но auth-матрица защищает и сам префикс — публичная
 * страница на нём уехала бы за логин билдера.
 *
 * @param prefixes - Активные префиксы.
 * @param resolveRouteName - Резолвер имени маршрута по пути.
 * @param address - Адрес страницы.
 */
export function isPageAddressTaken(
    prefixes: IBricksRoutePrefixes,
    resolveRouteName: (path: string) => string | undefined,
    address: IBricksPageAddress
): boolean {
    const path = getPublishedPagePath(address);

    return (
        isProtectedBricksHtmlPath(prefixes, path) ||
        isPathTakenByOther(resolveRouteName, path, PUBLISHED_PAGE_ROUTE_NAMES)
    );
}

/**
 * Путь редактора страницы: `<builderPrefix>/<urlPrefix>/<pagename>` либо
 * `<builderPrefix>/<pagename>` без префикса. Адрес редактора повторяет адрес
 * страницы, потому что имя уникально только внутри своего префикса: у `/blog/post`
 * и `/news/post` редакторы обязаны различаться.
 *
 * @param prefixes - Активные префиксы.
 * @param address - Адрес страницы.
 */
export function getBuilderPagePath(
    prefixes: IBricksRoutePrefixes,
    address: IBricksPageAddress
): string {
    return `${prefixes.builderPrefix}/${getPageAddressKey(address)}`;
}

/**
 * Адрес РЕДАКТОРА страницы занят: путь редактора достаётся не редактору, а
 * статическому соседу (страница логина, вложенный маршрут потребителя). Сама
 * published-страница при этом обычно достижима — недостижим именно её редактор,
 * поэтому проверка отдельная от `isPageAddressTaken`.
 *
 * Проверяется полный адрес, а не одно имя: `bricks-login` без префикса
 * действительно отбирает путь у страницы логина, а `blog/bricks-login` живёт по
 * свободному `<builderPrefix>/blog/bricks-login` и запрещать его не за что.
 *
 * @param prefixes - Активные префиксы.
 * @param resolveRouteName - Резолвер имени маршрута по пути.
 * @param address - Адрес страницы.
 */
export function isEditorAddressTaken(
    prefixes: IBricksRoutePrefixes,
    resolveRouteName: (path: string) => string | undefined,
    address: IBricksPageAddress
): boolean {
    return isPathTakenByOther(
        resolveRouteName,
        getBuilderPagePath(prefixes, address),
        BRICKS_BUILDER_PAGE_ROUTE_NAMES
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
