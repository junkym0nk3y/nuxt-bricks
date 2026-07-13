// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    resolveBricksBackendConfig,
    type IBricksBackendResolutionInput,
} from '../../src/module-backend-config';
// #endregion

/**
 * Сокращение для резолвера с дефолтами (basic-auth, всё пусто).
 */
function resolved(overrides: Partial<IBricksBackendResolutionInput> = {}) {
    return resolveBricksBackendConfig({
        configuredMode: undefined,
        backendUrl: '',
        databaseUrl: '',
        authMode: 'basic',
        ...overrides,
    });
}

describe('resolveBricksBackendConfig: external', () => {
    it('external + url → чистый external без диагностики', () => {
        const resolution = resolved({
            configuredMode: 'external',
            backendUrl: 'https://api.example.com/my-cms',
        });
        expect(resolution.mode).toBe('external');
        expect(resolution.warnings).toEqual([]);
        expect(resolution.errors).toEqual([]);
    });

    it('external без url → warning (env может прийти на деплое), не ошибка', () => {
        const resolution = resolved({ configuredMode: 'external' });
        expect(resolution.mode).toBe('external');
        expect(resolution.errors).toEqual([]);
        expect(resolution.warnings).toHaveLength(1);
        expect(resolution.warnings[0]).toContain('NUXT_BRICKS_BACKEND_URL');
    });

    it('external + databaseUrl → warning об игнорируемом database.url', () => {
        const resolution = resolved({
            configuredMode: 'external',
            backendUrl: 'https://api.example.com',
            databaseUrl: 'postgres://localhost/bricks',
        });
        expect(resolution.mode).toBe('external');
        expect(resolution.errors).toEqual([]);
        expect(resolution.warnings).toHaveLength(1);
        expect(resolution.warnings[0]).toContain('database.url игнорируется');
    });

    it('external + database-auth → build-ошибка (не рантайм-503)', () => {
        const resolution = resolved({
            configuredMode: 'external',
            backendUrl: 'https://api.example.com',
            authMode: 'database',
        });
        expect(resolution.mode).toBe('external');
        expect(resolution.errors).toHaveLength(1);
        expect(resolution.errors[0]).toContain('auth.mode');
    });
});

describe('resolveBricksBackendConfig: builtin (явный и дефолтный)', () => {
    it('builtin + databaseUrl → чистый builtin без диагностики', () => {
        const resolution = resolved({
            configuredMode: 'builtin',
            databaseUrl: 'postgres://localhost/bricks',
        });
        expect(resolution.mode).toBe('builtin');
        expect(resolution.warnings).toEqual([]);
        expect(resolution.errors).toEqual([]);
    });

    it('mode не задан → builtin по умолчанию', () => {
        const resolution = resolved({ databaseUrl: 'postgres://localhost/bricks' });
        expect(resolution.mode).toBe('builtin');
        expect(resolution.warnings).toEqual([]);
        expect(resolution.errors).toEqual([]);
    });

    it('builtin + backendUrl → warning об игнорируемом backend.url', () => {
        const resolution = resolved({
            configuredMode: 'builtin',
            databaseUrl: 'postgres://localhost/bricks',
            backendUrl: 'https://api.example.com',
        });
        expect(resolution.mode).toBe('builtin');
        expect(resolution.warnings).toHaveLength(1);
        expect(resolution.warnings[0]).toContain('backend.url игнорируется');
    });

    it('builtin + database-auth — валидная пара', () => {
        const resolution = resolved({
            configuredMode: 'builtin',
            databaseUrl: 'postgres://localhost/bricks',
            authMode: 'database',
        });
        expect(resolution.errors).toEqual([]);
        expect(resolution.warnings).toEqual([]);
    });

    it('builtin без databaseUrl → warning (env может прийти на деплое), не ошибка', () => {
        const resolution = resolved({ configuredMode: 'builtin' });
        expect(resolution.mode).toBe('builtin');
        expect(resolution.errors).toEqual([]);
        expect(resolution.warnings).toHaveLength(1);
        expect(resolution.warnings[0]).toContain('NUXT_BRICKS_DATABASE_URL');
    });

    it('ничего не задано → builtin + warning про /api/bricks/**', () => {
        const resolution = resolved({});
        expect(resolution.mode).toBe('builtin');
        expect(resolution.errors).toEqual([]);
        expect(resolution.warnings).toHaveLength(1);
        expect(resolution.warnings[0]).toContain('/api/bricks/**');
    });
});
