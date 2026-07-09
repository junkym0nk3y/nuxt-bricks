/**
 * Матрица защиты путей — общая для basic- и database-режимов
 * (`server/middleware/auth.ts`).
 *
 * Защищаются:
 * - /bricks/** — менеджер страниц и редактор
 * - /preview/** — превью рендера
 * - /mock-api/s3-* — S3 операции
 * - /api/bricks/** POST/PUT/PATCH/DELETE — мутации
 *
 * Database-only исключения: /bricks/login (страница логина) и
 * /api/bricks/auth/** (login/logout/me) — иначе на форму не попасть.
 */
import type { TBricksAuthMode } from './types';

/** HTTP методы, которые модифицируют данные. */
const MUTATION_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * Путь — HTML-страница билдера/превью (для выбора redirect-vs-401).
 */
export function isProtectedHtmlPath(pathname: string): boolean {
    return (
        pathname === '/bricks' ||
        pathname.startsWith('/bricks/') ||
        pathname.startsWith('/preview/')
    );
}

/**
 * Проверяет, требует ли запрос авторизации в заданном режиме.
 *
 * @param pathname - Путь запроса (без query).
 * @param method - HTTP-метод.
 * @param mode - Активный auth-режим.
 * @returns true — если путь защищён.
 */
export function requiresAuth(pathname: string, method: string, mode: TBricksAuthMode): boolean {
    // Database-режим: страница логина и auth-ручки открыты — иначе не войти
    if (mode === 'database') {
        if (pathname === '/bricks/login' || pathname.startsWith('/api/bricks/auth/')) {
            return false;
        }
    }

    if (isProtectedHtmlPath(pathname)) {
        return true;
    }

    // S3 операции — всегда защищены
    if (pathname.startsWith('/mock-api/s3-')) {
        return true;
    }

    // Bricks API — защищаем только модифицирующие методы
    if (pathname.startsWith('/api/bricks') && MUTATION_METHODS.includes(method)) {
        return true;
    }

    return false;
}
