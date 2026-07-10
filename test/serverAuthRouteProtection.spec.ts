// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    requiresAuth,
    isProtectedHtmlPath,
} from '../src/runtime/server/utils/auth/routeProtection';
import { DEFAULT_BRICKS_ROUTE_PREFIXES } from '../src/runtime/modules/common/utils/bricks/routePaths';
// #endregion

const PREFIXES = DEFAULT_BRICKS_ROUTE_PREFIXES;
const CUSTOM_PREFIXES = { builderPrefix: '/admin/builder', previewPrefix: '/look' };

describe('routeProtection: матрица защищённых путей', () => {
    it('защищает /bricks, /bricks/**, /preview/** в обоих режимах', () => {
        for (const mode of ['basic', 'database'] as const) {
            expect(requiresAuth('/bricks', 'GET', mode, PREFIXES)).toBe(true);
            expect(requiresAuth('/bricks/my-page', 'GET', mode, PREFIXES)).toBe(true);
            expect(requiresAuth('/preview/my-page', 'GET', mode, PREFIXES)).toBe(true);
        }
    });

    it('не защищает published-страницы и public read-model', () => {
        for (const mode of ['basic', 'database'] as const) {
            expect(requiresAuth('/', 'GET', mode, PREFIXES)).toBe(false);
            expect(requiresAuth('/my-landing', 'GET', mode, PREFIXES)).toBe(false);
            expect(requiresAuth('/api/bricks/public/pages/my-page', 'GET', mode, PREFIXES)).toBe(
                false
            );
            expect(requiresAuth('/api/bricks/public/pages/my-page', 'HEAD', mode, PREFIXES)).toBe(
                false
            );
        }
    });

    it('защищает editorial GET (списки с drafts/schema, медиатека, версии)', () => {
        for (const mode of ['basic', 'database'] as const) {
            expect(requiresAuth('/api/bricks', 'GET', mode, PREFIXES)).toBe(true);
            expect(requiresAuth('/api/bricks/1', 'GET', mode, PREFIXES)).toBe(true);
            expect(requiresAuth('/api/bricks/media', 'GET', mode, PREFIXES)).toBe(true);
            expect(requiresAuth('/api/bricks/1/versions', 'GET', mode, PREFIXES)).toBe(true);
            expect(requiresAuth('/api/bricks/1/versions/2', 'GET', mode, PREFIXES)).toBe(true);
        }
    });

    it('защищает мутации /api/bricks/** (включая public-пути) и /mock-api/s3-*', () => {
        for (const mode of ['basic', 'database'] as const) {
            expect(requiresAuth('/api/bricks', 'POST', mode, PREFIXES)).toBe(true);
            expect(requiresAuth('/api/bricks/1', 'PUT', mode, PREFIXES)).toBe(true);
            expect(requiresAuth('/api/bricks/1', 'PATCH', mode, PREFIXES)).toBe(true);
            expect(requiresAuth('/api/bricks/1', 'DELETE', mode, PREFIXES)).toBe(true);
            expect(requiresAuth('/api/bricks/public/pages/my-page', 'POST', mode, PREFIXES)).toBe(
                true
            );
            expect(requiresAuth('/mock-api/s3-image', 'POST', mode, PREFIXES)).toBe(true);
        }
    });

    it('database-режим открывает /bricks/login и /api/bricks/auth/**', () => {
        expect(requiresAuth('/bricks/login', 'GET', 'database', PREFIXES)).toBe(false);
        expect(requiresAuth('/api/bricks/auth/login', 'POST', 'database', PREFIXES)).toBe(false);
        expect(requiresAuth('/api/bricks/auth/logout', 'POST', 'database', PREFIXES)).toBe(false);
        expect(requiresAuth('/api/bricks/auth/me', 'GET', 'database', PREFIXES)).toBe(false);
    });

    it('basic-режим держит /bricks/login и auth-ручки под защитой (by design)', () => {
        expect(requiresAuth('/bricks/login', 'GET', 'basic', PREFIXES)).toBe(true);
        expect(requiresAuth('/api/bricks/auth/login', 'POST', 'basic', PREFIXES)).toBe(true);
    });

    it('isProtectedHtmlPath различает HTML-пути и API', () => {
        expect(isProtectedHtmlPath('/bricks', PREFIXES)).toBe(true);
        expect(isProtectedHtmlPath('/bricks/my-page', PREFIXES)).toBe(true);
        expect(isProtectedHtmlPath('/preview/my-page', PREFIXES)).toBe(true);
        expect(isProtectedHtmlPath('/api/bricks', PREFIXES)).toBe(false);
        expect(isProtectedHtmlPath('/mock-api/s3-image', PREFIXES)).toBe(false);
        expect(isProtectedHtmlPath('/bricks-like-page', PREFIXES)).toBe(false);
    });
});

describe('routeProtection: кастомные префиксы (bricks.routes)', () => {
    it('матрица следует за префиксами, дефолтные пути свободны', () => {
        for (const mode of ['basic', 'database'] as const) {
            expect(requiresAuth('/admin/builder', 'GET', mode, CUSTOM_PREFIXES)).toBe(true);
            expect(requiresAuth('/admin/builder/my-page', 'GET', mode, CUSTOM_PREFIXES)).toBe(true);
            expect(requiresAuth('/look/my-page', 'GET', mode, CUSTOM_PREFIXES)).toBe(true);

            // Прежние пути больше не поверхность bricks — обычные страницы приложения
            expect(requiresAuth('/bricks', 'GET', mode, CUSTOM_PREFIXES)).toBe(false);
            expect(requiresAuth('/preview/my-page', 'GET', mode, CUSTOM_PREFIXES)).toBe(false);

            // API-неймспейсы от префиксов не зависят
            expect(requiresAuth('/api/bricks', 'GET', mode, CUSTOM_PREFIXES)).toBe(true);
            expect(requiresAuth('/mock-api/s3-image', 'POST', mode, CUSTOM_PREFIXES)).toBe(true);
        }
    });

    it('database-режим открывает login-страницу под кастомным префиксом', () => {
        expect(requiresAuth('/admin/builder/login', 'GET', 'database', CUSTOM_PREFIXES)).toBe(
            false
        );
        expect(requiresAuth('/bricks/login', 'GET', 'database', CUSTOM_PREFIXES)).toBe(false);
    });
});
