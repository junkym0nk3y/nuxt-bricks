/**
 * Чистые предикаты локальных API-путей — единственная копия правила
 * «`/api/bricks/**` всегда обслуживается локальными Nitro-ручками» для
 * клиента (useApiClient) и сервера (devProxy routing).
 * С введением bricks.backend.mode persistence не выбирается PROXY_URL,
 * поэтому решение не зависит от наличия БД
 * (docs/backend-connection-modes-plan-2026-07-12.md).
 */

// #region Constants
/** Префиксы локальных ручек: persistence, health, auth, библиотека
 * компонентов, media proxy, page thumbnail. */
const LOCAL_API_PREFIXES = ['/api/bricks'];

/**
 * Синтетическая база для разбора origin-form строки запроса. Домен в зоне
 * `.invalid` (RFC 2606) настоящему сервису принадлежать не может.
 *
 * Совпадение host с этой базой — НЕ доказательство, что своего authority в
 * строке не было: строка вправе назвать тот же host сама
 * (`//local-api.invalid/api/bricks/x`), и сравнение этого не различит. Поэтому
 * authority опознаётся синтаксически, до разбора (`startsWithAuthority`), а
 * сравнение с host базы остаётся второй сетью.
 */
const INTERNAL_PARSE_BASE = new URL('http://local-api.invalid');

/**
 * Символы, которые разборщик URL выкидывает из строки перед разбором: ими можно
 * замаскировать начало authority (`/<TAB>/host`).
 */
const URL_IGNORED_CHARS_PATTERN = /[\t\n\r]/g;

/**
 * Начало authority по WHATWG: два слэша, любой из которых может быть обратным
 * (`//host`, `/\host`, `/\/host`).
 */
const AUTHORITY_START_PATTERN = /^[/\\]{2}/;
// #endregion

/**
 * Проверяет, что pathname лежит внутри префикса по границе сегмента:
 * `/api/bricks/x` и `/api/bricks` — да, `/api/bricksmith` — нет.
 *
 * @param pathname - Разобранный pathname запроса (без query/hash).
 * @param prefix - Префикс без trailing slash.
 * @returns true, если pathname — сам префикс или путь под ним.
 */
export function matchesPathPrefix(pathname: string, prefix: string): boolean {
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Решает, является ли pathname локальным API-путём модуля (`/api/bricks/**`).
 *
 * @param pathname - Разобранный pathname запроса (без query/hash).
 * @returns true для локальных bricks-путей.
 */
export function isLocalApiPathname(pathname: string): boolean {
    return LOCAL_API_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix));
}

/**
 * Начинается ли строка запроса с authority — то есть адресует ли она хост, а не
 * путь текущего origin. Игнорируемые разборщиком TAB/LF/CR снимаются до
 * проверки: `/<TAB>/host` парсер видит как `//host`.
 *
 * @param request - Строка запроса $fetch.
 * @returns true, если строка несёт authority.
 */
function startsWithAuthority(request: string): boolean {
    return AUTHORITY_START_PATTERN.test(request.replace(URL_IGNORED_CHARS_PATTERN, ''));
}

/**
 * Решает по строке запроса $fetch, локальный ли это API-путь: origin-form
 * (`/api/bricks/pages?x=1`) разбирается до pathname (query/hash не влияют
 * на решение), абсолютные URL и пути без ведущего слэша локальными не
 * считаются (для них baseURL-переключение не применяется).
 *
 * Адрес с authority локальным не считается ни в каком написании: ему досталась
 * бы identity инсталляции, положенная только своим ручкам, а pathname у него
 * такой же, как у своего пути. Решает синтаксис, а не сравнение с базой разбора:
 * host базы строка вправе назвать сама, и тогда сравнение пропустит чужой
 * authority (`//local-api.invalid/api/bricks/x`).
 *
 * Сравнение host оставлено после синтаксической проверки, но при ней оно
 * недостижимо: строка с ведущим `/` и без начала authority host базы подменить
 * не может. Это страховка на случай, если проверки выше когда-нибудь ослабят
 * (например разрешат абсолютные URL) — поэтому спекой она и не покрыта: мутация
 * «убрать сравнение» набор не краснит, и это ожидаемо.
 *
 * @param request - Строка запроса $fetch (путь, возможно с query/hash).
 * @returns true, если запрос должен уйти на локальный Nuxt-сервер.
 */
export function isLocalApiRequest(request: string): boolean {
    if (!request.startsWith('/') || startsWithAuthority(request)) {
        return false;
    }

    try {
        const parsed = new URL(request, INTERNAL_PARSE_BASE);

        if (parsed.host !== INTERNAL_PARSE_BASE.host) {
            return false;
        }

        return isLocalApiPathname(parsed.pathname);
    } catch {
        return false;
    }
}
