/**
 * Общие константы публикации страниц — единый источник для клиентской
 * валидации (yup-схема формы) и серверной валидации DTO (/api/bricks/**).
 */

// Списка зарезервированных pagename здесь нет намеренно: занятость адреса
// выясняется у роутинга (`utils/bricks/routePaths.ts` — `isPageAddressTaken` и
// `isEditorAddressTaken`), потому что список пришлось бы держать вручную и он
// всё равно не знал бы о страницах приложения-потребителя.

/** Границы длины pagename (синхронизированы с клиентской yup-схемой). */
export const PAGENAME_MIN_LENGTH = 3;
export const PAGENAME_MAX_LENGTH = 80;

/**
 * Границы SEO-полей страницы. Единый источник для трёх мест сразу: yup-схемы
 * формы, серверной валидации DTO и счётчиков символов в редакторах. Раньше числа
 * стояли константами в каждом месте, и панель деталей ограничивала title 120
 * символами, а сайдбар — ничем.
 */
export const TITLE_MIN_LENGTH = 3;
export const TITLE_MAX_LENGTH = 120;
export const DESCRIPTION_MIN_LENGTH = 10;
export const DESCRIPTION_MAX_LENGTH = 500;

/**
 * Лимит `keywords` считается по СКЛЕЕННОЙ строке (то, что уезжает в
 * `<meta name="keywords">` и в колонку `keywords TEXT`), а не по числу тегов.
 */
export const KEYWORDS_MAX_LENGTH = 255;

/**
 * Класс символов одного URL-сегмента published-страницы (pagename или сегмент
 * urlPrefix). Единый источник и для валидационных паттернов ниже, и для
 * custom-regex параметров статических published-маршрутов (module.ts).
 */
export const PAGE_ROUTE_SEGMENT = '[a-z0-9-]+';

/** Допустимый формат pagename. */
export const PAGENAME_PATTERN = new RegExp(`^${PAGE_ROUTE_SEGMENT}$`);

/** Допустимый формат urlPrefix: сегменты `[a-z0-9-]`, разделённые `/`. */
export const URL_PREFIX_PATTERN = new RegExp(`^${PAGE_ROUTE_SEGMENT}(/${PAGE_ROUTE_SEGMENT})*$`);
export const URL_PREFIX_MAX_LENGTH = 100;

/** Допустимый формат subdomain (непустого — пустой нормализуется в null). */
export const SUBDOMAIN_PATTERN = /^[a-z0-9-]+$/;
export const SUBDOMAIN_MAX_LENGTH = 63;

/**
 * Машиночитаемые коды 409-конфликтов записи страницы (`data.code` ответа):
 * pagename — имя занято (unique constraint), revision — страница изменена
 * после чтения переданного expectedRevision (optimistic locking). Единый
 * источник для сервера (storageErrors/handlerHelpers) и клиента (requestErrors).
 */
export const PAGE_CONFLICT_CODES = {
    pagename: 'PAGENAME_CONFLICT',
    revision: 'REVISION_CONFLICT',
} as const;
