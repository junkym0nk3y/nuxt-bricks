/**
 * Типы адресной идентичности страницы.
 *
 * Страницу опознаёт пара `urlPrefix + pagename`, а не одно имя: имя уникально
 * только внутри своего префикса, поэтому `/blog/post` и `/news/post` — разные
 * страницы. Уникальность пары держит база (`uq_bricks_pages_address`), и все
 * места, которые раньше адресовали страницу одним `pagename` (URL редактора и
 * превью, ключи черновиков и SSR-payload, публичный lookup), работают с этой
 * парой.
 */

export interface IBricksPageAddress {
    /**
     * Префикс адреса (`blog`, `blog/2026`) либо `null` у страницы без префикса.
     * Пустая и пробельная строка равносильны `null` — так же, как их
     * нормализуют формы и серверный DTO.
     */
    urlPrefix: string | null;
    /** ЧПУ страницы — последний сегмент адреса. */
    pagename: string;
}

/**
 * Параметры маршрута, из которых собирается адрес: у prefixed-маршрутов
 * `urlPrefix` — repeatable-параметр (массив сегментов), у bare-маршрутов его
 * нет вовсе.
 */
export interface IBricksPageRouteParams {
    pagename?: unknown;
    urlPrefix?: unknown;
}

/**
 * Named-локация адресного маршрута для `router.push`. Имя выбирается по наличию
 * префикса, потому что prefixed- и bare-адрес обслуживают разные записи
 * маршрута, а `params` без нужного ключа vue-router молча срезал бы до
 * `<prefix>` без остатка.
 */
export interface IBricksPageRouteLocation {
    name: string;
    params: {
        pagename: string;
        /** Сегменты префикса; у bare-маршрута ключа нет вовсе. */
        urlPrefix?: string[];
    };
}
