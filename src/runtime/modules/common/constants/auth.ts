/**
 * Имя HttpOnly cookie сессии database-auth.
 *
 * Живёт в common: серверные утилиты сессии (server/utils/auth/sessionCookie)
 * ставят/читают cookie, а фильтрация identity-заголовков перед проксированием
 * на внешний backend (useApiClient, proxy middleware) вырезает её по имени.
 */
export const BRICKS_SESSION_COOKIE_NAME = 'bricks-session';
