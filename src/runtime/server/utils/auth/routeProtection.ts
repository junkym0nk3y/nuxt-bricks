/**
 * Матрица защиты путей — общая для basic- и database-режимов
 * (`server/middleware/auth.ts`).
 *
 * Защищаются (префиксы билдера/превью — из `bricks.routes`, дефолты
 * `/bricks` и `/preview`):
 * - `<builderPrefix>/**` — менеджер страниц и редактор
 * - `<previewPrefix>/**` — превью рендера
 * - /mock-api/s3-* — S3 операции
 * - /api/bricks/** — весь editorial API, включая read (списки страниц
 *   с drafts/schema и медиатека не публичны)
 *
 * Открыт только public read-model: GET/HEAD /api/bricks/public/** —
 * published-проекции для рендера. Database-only исключения:
 * `<builderPrefix>/login` (страница логина) и /api/bricks/auth/**
 * (login/logout/me) — иначе на форму не попасть.
 *
 * Все функции принимают ЛОГИЧЕСКИЙ путь (без `app.baseURL`) — middleware
 * стрипает base до вызова матрицы.
 */
import type { TBricksAuthMode } from './types';
import {
    getBuilderLoginPath,
    isProtectedBricksHtmlPath,
    type IBricksRoutePrefixes,
} from '../../../modules/common/utils/bricks/routePaths';

/** HTTP методы чтения, разрешённые на public read-model без авторизации. */
const PUBLIC_READ_METHODS = ['GET', 'HEAD'];

/**
 * Путь — HTML-страница билдера/превью (для выбора redirect-vs-401).
 *
 * @param pathname - Логический путь запроса (без baseURL и query).
 * @param prefixes - Активные префиксы маршрутов.
 */
export function isProtectedHtmlPath(pathname: string, prefixes: IBricksRoutePrefixes): boolean {
    return isProtectedBricksHtmlPath(prefixes, pathname);
}

/**
 * Проверяет, требует ли запрос авторизации в заданном режиме.
 *
 * @param pathname - Логический путь запроса (без baseURL и query).
 * @param method - HTTP-метод.
 * @param mode - Активный auth-режим.
 * @param prefixes - Активные префиксы маршрутов.
 * @returns true — если путь защищён.
 */
export function requiresAuth(
    pathname: string,
    method: string,
    mode: TBricksAuthMode,
    prefixes: IBricksRoutePrefixes
): boolean {
    // Database-режим: страница логина и auth-ручки открыты — иначе не войти
    if (mode === 'database') {
        if (
            pathname === getBuilderLoginPath(prefixes) ||
            pathname.startsWith('/api/bricks/auth/')
        ) {
            return false;
        }
    }

    if (isProtectedHtmlPath(pathname, prefixes)) {
        return true;
    }

    // S3 операции — всегда защищены
    if (pathname.startsWith('/mock-api/s3-')) {
        return true;
    }

    // Public read-model — единственная открытая часть /api/bricks (только чтение)
    if (pathname.startsWith('/api/bricks/public/') && PUBLIC_READ_METHODS.includes(method)) {
        return false;
    }

    // Editorial API — защищён целиком, включая GET (drafts, полная schema, медиатека)
    if (pathname.startsWith('/api/bricks')) {
        return true;
    }

    return false;
}
