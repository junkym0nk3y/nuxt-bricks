import type { TBricksUserRole } from '../types/auth';

/**
 * Имя HttpOnly cookie сессии database-auth.
 *
 * Живёт в common: серверные утилиты сессии (server/utils/auth/sessionCookie)
 * ставят/читают cookie, а фильтрация identity-заголовков перед проксированием
 * на внешний backend (useApiClient, proxy middleware) вырезает её по имени.
 */
export const BRICKS_SESSION_COOKIE_NAME = 'bricks-session';

/**
 * Ранг роли: чем больше, тем шире права. Роли строго вложены
 * (viewer ⊂ editor ⊂ admin), поэтому проверка доступа — сравнение чисел,
 * а не таблица «роль × разрешение», которую пришлось бы править на каждое
 * новое действие.
 */
export const BRICKS_ROLE_RANK: Record<TBricksUserRole, number> = {
    viewer: 1,
    editor: 2,
    admin: 3,
};

/**
 * Роль, приписываемая basic-режиму. Учёток в нём нет вовсе, identity одна на
 * всех и задана переменными окружения, поэтому редакторские права выдаются
 * целиком — сузить их не по кому. Управление учётками и профиль при этом
 * недоступны: без database-режима им не на чём работать.
 */
export const BRICKS_BASIC_MODE_ROLE: TBricksUserRole = 'admin';

/**
 * Имя кастомного CSRF-заголовка unsafe-запросов bricks-API.
 *
 * Кросс-доменный документ не может поставить кастомный заголовок без
 * CORS-preflight (CORS модуль не включает) — его присутствие доказывает
 * same-origin. Клиент билдера (useApiClient) шлёт его всегда; не-браузерная
 * автоматизация обязана добавлять `x-bricks-csrf: 1` к unsafe-запросам.
 */
export const BRICKS_CSRF_HEADER_NAME = 'x-bricks-csrf';
