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
 * Границы логина НОВОЙ учётки (создание через `/api/bricks/users`).
 *
 * Отдельно от границ, которые принимает вход (`auth/login.post.ts`, до 255
 * символов — длина колонки): логин уже существующей учётки могли задать CLI или
 * прошлая версия, и требовать от него нового формата на входе значило бы
 * запереть человека снаружи. Проверка формата — только на создании.
 */
export const BRICKS_NEW_USERNAME_MIN_LENGTH = 3;
export const BRICKS_NEW_USERNAME_MAX_LENGTH = 64;

/**
 * Допустимый формат нового логина — уже приведённого к нижнему регистру
 * (уникальность держится индексом по `lower(username)`, и разный регистр одного
 * логина — одна учётка). Точка, дефис, подчёркивание, плюс и `@` разрешены:
 * почта в роли логина — ходовой случай.
 */
export const BRICKS_NEW_USERNAME_PATTERN = /^[a-z0-9][a-z0-9._@+-]*$/;

/** Минимальная длина пароля, задаваемого через API (не через CLI). */
export const BRICKS_PASSWORD_MIN_LENGTH = 8;

/**
 * Санитарная граница длины пароля: scrypt считает тем дольше, чем длиннее вход.
 * Совпадает с границей на входе (`auth/login.post.ts`) — иначе пароль, который
 * приняли при установке, не прошёл бы при попытке войти.
 */
export const BRICKS_PASSWORD_MAX_LENGTH = 1024;

/**
 * Имя кастомного CSRF-заголовка unsafe-запросов bricks-API.
 *
 * Кросс-доменный документ не может поставить кастомный заголовок без
 * CORS-preflight (CORS модуль не включает) — его присутствие доказывает
 * same-origin. Клиент билдера (useApiClient) шлёт его всегда; не-браузерная
 * автоматизация обязана добавлять `x-bricks-csrf: 1` к unsafe-запросам.
 */
export const BRICKS_CSRF_HEADER_NAME = 'x-bricks-csrf';
