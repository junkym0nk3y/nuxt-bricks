// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    requiresAuth,
    isProtectedHtmlPath,
} from '../../src/runtime/server/utils/auth/routeProtection';
import { DEFAULT_BRICKS_ROUTE_PREFIXES } from '../../src/runtime/modules/common/utils/bricks/routePaths';
// #endregion

const PREFIXES = DEFAULT_BRICKS_ROUTE_PREFIXES;
const CUSTOM_PREFIXES = { builderPrefix: '/admin/builder', previewPrefix: '/look' };

describe('routeProtection: матрица защищённых путей', () => {
    it('защищает поддеревья префиксов билдера и превью в обоих режимах', () => {
        for (const mode of ['basic', 'database'] as const) {
            expect(requiresAuth('/bricks', 'GET', mode, PREFIXES)).toBe(true);
            expect(requiresAuth('/bricks/my-page', 'GET', mode, PREFIXES)).toBe(true);
            expect(requiresAuth('/bricks-preview/my-page', 'GET', mode, PREFIXES)).toBe(true);

            // Ходовые адреса потребителю оставлены: поверхности сидят в
            // неймспейсе bricks-, поэтому сами /login и /preview свободны
            expect(requiresAuth('/login', 'GET', mode, PREFIXES)).toBe(false);
            expect(requiresAuth('/preview', 'GET', mode, PREFIXES)).toBe(false);
            expect(requiresAuth('/preview/my-page', 'GET', mode, PREFIXES)).toBe(false);
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
            // Адрес страницы уезжает остатком пути, поэтому у public-ручки
            // переменное число сегментов: сузься правило до одного — SSR-визит
            // на `/blog/post` уходил бы за логин билдера
            expect(
                requiresAuth('/api/bricks/public/pages/blog/2026/post', 'GET', mode, PREFIXES)
            ).toBe(false);
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

    it('защищает мутации /api/bricks/** (включая public-пути и media-ручки)', () => {
        for (const mode of ['basic', 'database'] as const) {
            expect(requiresAuth('/api/bricks', 'POST', mode, PREFIXES)).toBe(true);
            expect(requiresAuth('/api/bricks/1', 'PUT', mode, PREFIXES)).toBe(true);
            expect(requiresAuth('/api/bricks/1', 'PATCH', mode, PREFIXES)).toBe(true);
            expect(requiresAuth('/api/bricks/1', 'DELETE', mode, PREFIXES)).toBe(true);
            expect(requiresAuth('/api/bricks/public/pages/my-page', 'POST', mode, PREFIXES)).toBe(
                true
            );
            expect(requiresAuth('/api/bricks/media/s3-proxy', 'POST', mode, PREFIXES)).toBe(true);
            expect(
                requiresAuth('/api/bricks/media/s3-page-thumbnail', 'POST', mode, PREFIXES)
            ).toBe(true);
        }
    });

    it('бывшие /mock-api/** пути освобождены — обычные пути host-приложения', () => {
        for (const mode of ['basic', 'database'] as const) {
            expect(requiresAuth('/mock-api/s3-media-proxy', 'POST', mode, PREFIXES)).toBe(false);
            expect(requiresAuth('/mock-api/s3-page-thumbnail', 'POST', mode, PREFIXES)).toBe(false);
            expect(requiresAuth('/mock-api/bricks-components', 'GET', mode, PREFIXES)).toBe(false);
        }
    });

    it('библиотека компонентов открыта на чтение, мутации — защищены', () => {
        for (const mode of ['basic', 'database'] as const) {
            expect(requiresAuth('/api/bricks/components', 'GET', mode, PREFIXES)).toBe(false);
            expect(requiresAuth('/api/bricks/components', 'HEAD', mode, PREFIXES)).toBe(false);

            expect(requiresAuth('/api/bricks/components', 'POST', mode, PREFIXES)).toBe(true);
            expect(requiresAuth('/api/bricks/components/extra', 'GET', mode, PREFIXES)).toBe(true);
        }
    });

    it('health-пробы открыты на чтение, мутации и похожие пути — защищены', () => {
        for (const mode of ['basic', 'database'] as const) {
            expect(requiresAuth('/api/bricks/health', 'GET', mode, PREFIXES)).toBe(false);
            expect(requiresAuth('/api/bricks/health', 'HEAD', mode, PREFIXES)).toBe(false);
            expect(requiresAuth('/api/bricks/health/ready', 'GET', mode, PREFIXES)).toBe(false);
            expect(requiresAuth('/api/bricks/health/ready', 'HEAD', mode, PREFIXES)).toBe(false);

            expect(requiresAuth('/api/bricks/health', 'POST', mode, PREFIXES)).toBe(true);
            expect(requiresAuth('/api/bricks/health/ready', 'POST', mode, PREFIXES)).toBe(true);
            expect(requiresAuth('/api/bricks/healthcheck', 'GET', mode, PREFIXES)).toBe(true);
            expect(requiresAuth('/api/bricks/health/other', 'GET', mode, PREFIXES)).toBe(true);
        }
    });

    it('database-режим открывает страницу логина и /api/bricks/auth/**', () => {
        expect(requiresAuth('/bricks/bricks-login', 'GET', 'database', PREFIXES)).toBe(false);
        expect(requiresAuth('/api/bricks/auth/login', 'POST', 'database', PREFIXES)).toBe(false);
        expect(requiresAuth('/api/bricks/auth/logout', 'POST', 'database', PREFIXES)).toBe(false);
        expect(requiresAuth('/api/bricks/auth/me', 'GET', 'database', PREFIXES)).toBe(false);
    });

    it('basic-режим держит страницу логина и auth-ручки под защитой (by design)', () => {
        expect(requiresAuth('/bricks/bricks-login', 'GET', 'basic', PREFIXES)).toBe(true);
        expect(requiresAuth('/api/bricks/auth/login', 'POST', 'basic', PREFIXES)).toBe(true);
    });

    it('isProtectedHtmlPath различает HTML-пути и API', () => {
        expect(isProtectedHtmlPath('/bricks', PREFIXES)).toBe(true);
        expect(isProtectedHtmlPath('/bricks/my-page', PREFIXES)).toBe(true);
        expect(isProtectedHtmlPath('/bricks-preview/my-page', PREFIXES)).toBe(true);
        expect(isProtectedHtmlPath('/api/bricks', PREFIXES)).toBe(false);
        expect(isProtectedHtmlPath('/api/bricks/media/s3-proxy', PREFIXES)).toBe(false);
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

            // API-неймспейс от префиксов не зависит
            expect(requiresAuth('/api/bricks', 'GET', mode, CUSTOM_PREFIXES)).toBe(true);
            expect(requiresAuth('/api/bricks/media/s3-proxy', 'POST', mode, CUSTOM_PREFIXES)).toBe(
                true
            );
        }
    });

    it('database-режим открывает login-страницу под кастомным префиксом', () => {
        expect(
            requiresAuth('/admin/builder/bricks-login', 'GET', 'database', CUSTOM_PREFIXES)
        ).toBe(false);
        expect(requiresAuth('/bricks/bricks-login', 'GET', 'database', CUSTOM_PREFIXES)).toBe(
            false
        );
    });
});
