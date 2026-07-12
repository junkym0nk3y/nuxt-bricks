// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    resolveBricksBackendConfig,
    type IBricksBackendResolutionInput,
} from '../src/module-backend-config';
// #endregion

/**
 * Сокращение для резолвера с дефолтами (production, basic-auth, всё пусто).
 */
function resolved(overrides: Partial<IBricksBackendResolutionInput> = {}) {
    return resolveBricksBackendConfig({
        configuredMode: undefined,
        backendUrl: '',
        databaseUrl: '',
        proxyUrl: '',
        authMode: 'basic',
        isDev: false,
        ...overrides,
    });
}

describe('resolveBricksBackendConfig: явный external', () => {
    it('external + url → чистый external без диагностики', () => {
        const resolution = resolved({
            configuredMode: 'external',
            backendUrl: 'https://api.example.com/my-cms',
        });
        expect(resolution.mode).toBe('external');
        expect(resolution.infos).toEqual([]);
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

    it('external + PROXY_URL — не конфликт (devProxy ортогонален data backend)', () => {
        const resolution = resolved({
            configuredMode: 'external',
            backendUrl: 'https://api.example.com',
            proxyUrl: 'http://localhost:8000/',
        });
        expect(resolution.warnings).toEqual([]);
        expect(resolution.errors).toEqual([]);
    });
});

describe('resolveBricksBackendConfig: явный builtin', () => {
    it('builtin + databaseUrl → чистый builtin без диагностики', () => {
        const resolution = resolved({
            configuredMode: 'builtin',
            databaseUrl: 'postgres://localhost/bricks',
        });
        expect(resolution.mode).toBe('builtin');
        expect(resolution.infos).toEqual([]);
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
});

describe('resolveBricksBackendConfig: legacy (mode не задан)', () => {
    it('databaseUrl → builtin + deprecation-info', () => {
        const resolution = resolved({ databaseUrl: 'postgres://localhost/bricks' });
        expect(resolution.mode).toBe('builtin');
        expect(resolution.errors).toEqual([]);
        expect(resolution.warnings).toEqual([]);
        expect(resolution.infos).toHaveLength(1);
        expect(resolution.infos[0]).toContain('deprecated');
    });

    it('databaseUrl + PROXY_URL → builtin (БД побеждает, prod-ошибки нет)', () => {
        const resolution = resolved({
            databaseUrl: 'postgres://localhost/bricks',
            proxyUrl: 'http://localhost:8000/',
        });
        expect(resolution.mode).toBe('builtin');
        expect(resolution.errors).toEqual([]);
    });

    it('только PROXY_URL в production → fail-fast ошибка с миграционной инструкцией', () => {
        const resolution = resolved({ proxyUrl: 'http://localhost:8000/' });
        expect(resolution.errors).toHaveLength(1);
        expect(resolution.errors[0]).toContain("mode: 'external'");
        expect(resolution.errors[0]).toContain('external-backend-contract');
    });

    it('только PROXY_URL в dev → builtin + warning, devProxy работает для не-bricks /api', () => {
        const resolution = resolved({ proxyUrl: 'http://localhost:8000/', isDev: true });
        expect(resolution.mode).toBe('builtin');
        expect(resolution.errors).toEqual([]);
        expect(resolution.warnings).toHaveLength(1);
        expect(resolution.warnings[0]).toContain('devProxy');
    });

    it('ничего не задано → builtin + warning (совместимо с pack-smoke: 500/503)', () => {
        const resolution = resolved({});
        expect(resolution.mode).toBe('builtin');
        expect(resolution.errors).toEqual([]);
        expect(resolution.warnings).toHaveLength(1);
        expect(resolution.warnings[0]).toContain('/api/bricks/**');
    });

    it('ничего не задано в dev → тот же warning, не ошибка', () => {
        const resolution = resolved({ isDev: true });
        expect(resolution.mode).toBe('builtin');
        expect(resolution.errors).toEqual([]);
        expect(resolution.warnings).toHaveLength(1);
    });
});
