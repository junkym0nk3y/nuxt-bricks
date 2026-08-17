// #region Imports
// Node
import { existsSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';

// Vitest
import { describe, expect, it } from 'vitest';

// Manifest
import { BRICKS_API_HANDLERS } from '../../src/api-handlers';

// Utils
import { resolveRequiredAccess } from '../../src/runtime/server/utils/auth/rolePolicy';
import { requiresAuth } from '../../src/runtime/server/utils/auth/routeProtection';
import { DEFAULT_BRICKS_ROUTE_PREFIXES } from '../../src/runtime/modules/common/utils/bricks/routePaths';

// Types
import type { TBricksAccessRequirement } from '../../src/runtime/server/utils/auth/types';
// #endregion

const RUNTIME_DIR = resolve(__dirname, '../../src/runtime');
const API_DIR = resolve(RUNTIME_DIR, 'server/api/bricks');

/** Суффиксы файлов-обработчиков Nitro. */
const HANDLER_SUFFIXES = ['get', 'post', 'put', 'patch', 'delete'];

/**
 * Ожидаемая минимальная роль каждой защищённой ручки — утверждённая матрица
 * прав целиком, в одном месте. `null` — путь открыт без авторизации, и роль
 * для него не вычисляется вовсе.
 *
 * Таблица держится вручную намеренно: `resolveRequiredAccess` выводит
 * требование из метода, и без независимого списка ожиданий тест повторял бы
 * логику, которую проверяет. Новая ручка обязана появиться и здесь — иначе
 * тест падает, и решение о её правах принимается осознанно, а не достаётся
 * дефолтом.
 */
const EXPECTED_ACCESS: Record<string, TBricksAccessRequirement> = {
    'GET /api/bricks': 'viewer',
    'POST /api/bricks': 'editor',
    'POST /api/bricks/auth/login': null,
    'POST /api/bricks/auth/logout': null,
    'GET /api/bricks/auth/me': null,
    'GET /api/bricks/public/pages/**:address': null,
    'GET /api/bricks/health': null,
    'GET /api/bricks/health/ready': null,
    'GET /api/bricks/components': null,
    'GET /api/bricks/media': 'viewer',
    'POST /api/bricks/media/s3-proxy': 'viewer',
    'POST /api/bricks/media/s3-page-thumbnail': 'editor',
    'POST /api/bricks/media/upload': 'editor',
    'POST /api/bricks/media/import': 'admin',
    'GET /api/bricks/media/categories': 'viewer',
    'POST /api/bricks/media/categories': 'editor',
    'DELETE /api/bricks/media/categories/:slug': 'admin',
    'PATCH /api/bricks/media/:id': 'editor',
    'DELETE /api/bricks/media/:id': 'admin',
    'GET /api/bricks/users': 'admin',
    'POST /api/bricks/users': 'admin',
    // Свой профиль — любой вошедший: наблюдателю это единственное доступное
    // изменение. Роль внутри поддерева не спрашивается вовсе, поэтому `:id`-ручки
    // требуют её сами (test/server/authUserHandlersRoleGuard.spec.ts)
    'PATCH /api/bricks/users/me': 'authenticated',
    'POST /api/bricks/users/me/password': 'authenticated',
    'POST /api/bricks/users/me/avatar': 'authenticated',
    'DELETE /api/bricks/users/me/avatar': 'authenticated',
    'POST /api/bricks/users/:id/password': 'admin',
    'PATCH /api/bricks/users/:id': 'admin',
    'DELETE /api/bricks/users/:id': 'admin',
    'GET /api/bricks/:id/versions': 'viewer',
    'GET /api/bricks/:id/versions/:versionId': 'viewer',
    'POST /api/bricks/:id/versions/:versionId/restore': 'editor',
    'GET /api/bricks/:id': 'viewer',
    'PUT /api/bricks/:id': 'editor',
    'PATCH /api/bricks/:id': 'editor',
    'DELETE /api/bricks/:id': 'admin',
};

/**
 * Собирает пути файлов-обработчиков в дереве ручек (от runtimeDir, без .ts).
 *
 * @param directory - Просматриваемая папка.
 * @returns Пути вида `server/api/bricks/media/upload.post`.
 */
function collectHandlerFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const entryPath = resolve(directory, entry.name);

        if (entry.isDirectory()) {
            return collectHandlerFiles(entryPath);
        }

        const suffix = entry.name.split('.').at(-2);

        if (!entry.name.endsWith('.ts') || !suffix || !HANDLER_SUFFIXES.includes(suffix)) {
            return [];
        }

        return [relative(RUNTIME_DIR, entryPath).replace(/\.ts$/, '')];
    });
}

describe('BRICKS_API_HANDLERS: манифест /api/bricks/**', () => {
    it('каждый file манифеста существует на диске (строковые пути type-check не ловит)', () => {
        for (const { file } of BRICKS_API_HANDLERS) {
            expect(existsSync(resolve(RUNTIME_DIR, `${file}.ts`)), file).toBe(true);
        }
    });

    it('builder-ручки (бывший /mock-api/**) присутствуют с ожидаемыми route/method/file', () => {
        expect(BRICKS_API_HANDLERS).toContainEqual(
            expect.objectContaining({
                route: '/api/bricks/components',
                method: 'get',
                file: 'server/api/bricks/components.get',
            })
        );
        expect(BRICKS_API_HANDLERS).toContainEqual(
            expect.objectContaining({
                route: '/api/bricks/media/s3-proxy',
                method: 'post',
                file: 'server/api/bricks/media/s3-proxy.post',
            })
        );
        expect(BRICKS_API_HANDLERS).toContainEqual(
            expect.objectContaining({
                route: '/api/bricks/media/s3-page-thumbnail',
                method: 'post',
                file: 'server/api/bricks/media/s3-page-thumbnail.post',
            })
        );
    });

    it('перечисляет каждый файл-обработчик ровно один раз', () => {
        // Роуты модуля не автосканируются: файл, не попавший в манифест, просто
        // не становится маршрутом. Тихо — и потому обнаруживается в проде
        const manifestFiles = BRICKS_API_HANDLERS.map((entry) => entry.file);

        expect([...manifestFiles].sort()).toEqual(collectHandlerFiles(API_DIR).sort());
    });

    it('не содержит двух записей на одну пару «маршрут + метод»', () => {
        // Роутер h3 хранит по одному обработчику на пару: вторая регистрация
        // молча вытеснила бы первую
        const pairs = BRICKS_API_HANDLERS.map((entry) => `${entry.method} ${entry.route}`);

        expect(pairs).toHaveLength(new Set(pairs).size);
    });

    it('соблюдает утверждённую матрицу прав: удаление — админу, записи — редактору, чтение — наблюдателю', () => {
        for (const entry of BRICKS_API_HANDLERS) {
            const method = (entry.method ?? 'get').toUpperCase();
            const key = `${method} ${entry.route}`;

            expect(EXPECTED_ACCESS, key).toHaveProperty(key);

            const isOpen = !requiresAuth(
                entry.route,
                method,
                'database',
                DEFAULT_BRICKS_ROUTE_PREFIXES
            );

            expect(isOpen ? null : resolveRequiredAccess(entry.route, method), key).toBe(
                EXPECTED_ACCESS[key]
            );
        }
    });

    it('builder-ручки не помечены isPublic (в render-only режиме не регистрируются)', () => {
        const builderRoutes = [
            '/api/bricks/components',
            '/api/bricks/media/s3-proxy',
            '/api/bricks/media/s3-page-thumbnail',
        ];

        for (const route of builderRoutes) {
            const handler = BRICKS_API_HANDLERS.find((entry) => entry.route === route);
            expect(handler?.isPublic, route).toBeUndefined();
        }
    });
});
