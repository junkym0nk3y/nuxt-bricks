/**
 * Общие константы публикации страниц — единый источник для клиентской
 * валидации (yup-схема формы) и серверной валидации DTO (/api/bricks/**).
 */

/**
 * Зарезервированные pagename: 'login' занят страницей логина database-auth —
 * редактор страницы с таким именем (/bricks/login) был бы недостижим.
 */
export const RESERVED_PAGENAMES: readonly string[] = ['login'];

/** Границы длины pagename (синхронизированы с клиентской yup-схемой). */
export const PAGENAME_MIN_LENGTH = 3;
export const PAGENAME_MAX_LENGTH = 80;

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
