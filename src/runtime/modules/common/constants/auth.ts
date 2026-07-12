/**
 * Имя HttpOnly cookie сессии database-auth.
 *
 * Живёт в common: серверные утилиты сессии (server/utils/auth/sessionCookie)
 * ставят/читают cookie, а фильтрация identity-заголовков перед проксированием
 * на внешний backend (useApiClient, proxy middleware) вырезает её по имени.
 */
export const BRICKS_SESSION_COOKIE_NAME = 'bricks-session';

/**
 * Имя кастомного CSRF-заголовка unsafe-запросов bricks-API.
 *
 * Кросс-доменный документ не может поставить кастомный заголовок без
 * CORS-preflight (CORS модуль не включает) — его присутствие доказывает
 * same-origin. Клиент билдера (useApiClient) шлёт его всегда; не-браузерная
 * автоматизация обязана добавлять `x-bricks-csrf: 1` к unsafe-запросам.
 */
export const BRICKS_CSRF_HEADER_NAME = 'x-bricks-csrf';
