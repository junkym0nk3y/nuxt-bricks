// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    requiresAuth,
    isProtectedHtmlPath,
} from '../src/runtime/server/utils/auth/routeProtection';
// #endregion

describe('routeProtection: матрица защищённых путей', () => {
    it('защищает /bricks, /bricks/**, /preview/** в обоих режимах', () => {
        for (const mode of ['basic', 'database'] as const) {
            expect(requiresAuth('/bricks', 'GET', mode)).toBe(true);
            expect(requiresAuth('/bricks/my-page', 'GET', mode)).toBe(true);
            expect(requiresAuth('/preview/my-page', 'GET', mode)).toBe(true);
        }
    });

    it('не защищает published-страницы и GET /api/bricks', () => {
        for (const mode of ['basic', 'database'] as const) {
            expect(requiresAuth('/', 'GET', mode)).toBe(false);
            expect(requiresAuth('/my-landing', 'GET', mode)).toBe(false);
            expect(requiresAuth('/api/bricks', 'GET', mode)).toBe(false);
            expect(requiresAuth('/api/bricks/published', 'GET', mode)).toBe(false);
        }
    });

    it('защищает мутации /api/bricks/** и /mock-api/s3-*', () => {
        for (const mode of ['basic', 'database'] as const) {
            expect(requiresAuth('/api/bricks', 'POST', mode)).toBe(true);
            expect(requiresAuth('/api/bricks/1', 'PUT', mode)).toBe(true);
            expect(requiresAuth('/api/bricks/1', 'PATCH', mode)).toBe(true);
            expect(requiresAuth('/api/bricks/1', 'DELETE', mode)).toBe(true);
            expect(requiresAuth('/mock-api/s3-image', 'POST', mode)).toBe(true);
        }
    });

    it('database-режим открывает /bricks/login и /api/bricks/auth/**', () => {
        expect(requiresAuth('/bricks/login', 'GET', 'database')).toBe(false);
        expect(requiresAuth('/api/bricks/auth/login', 'POST', 'database')).toBe(false);
        expect(requiresAuth('/api/bricks/auth/logout', 'POST', 'database')).toBe(false);
        expect(requiresAuth('/api/bricks/auth/me', 'GET', 'database')).toBe(false);
    });

    it('basic-режим держит /bricks/login и auth-ручки под защитой (by design)', () => {
        expect(requiresAuth('/bricks/login', 'GET', 'basic')).toBe(true);
        expect(requiresAuth('/api/bricks/auth/login', 'POST', 'basic')).toBe(true);
    });

    it('isProtectedHtmlPath различает HTML-пути и API', () => {
        expect(isProtectedHtmlPath('/bricks')).toBe(true);
        expect(isProtectedHtmlPath('/bricks/my-page')).toBe(true);
        expect(isProtectedHtmlPath('/preview/my-page')).toBe(true);
        expect(isProtectedHtmlPath('/api/bricks')).toBe(false);
        expect(isProtectedHtmlPath('/mock-api/s3-image')).toBe(false);
        expect(isProtectedHtmlPath('/bricks-like-page')).toBe(false);
    });
});
