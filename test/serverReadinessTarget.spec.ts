// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    isProxyHealthStatusReady,
    isProxyStatusReady,
    resolveReadinessTarget,
} from '../src/runtime/server/utils/readinessTarget';
// #endregion

/** Вход резолвера с дефолтами explicit-builtin без конфигурации. */
function makeInput(overrides: Partial<Parameters<typeof resolveReadinessTarget>[0]> = {}) {
    return {
        hasExternalBackend: false,
        isLegacyBackendMode: false,
        hasDatabaseUrl: false,
        hasProxyUrl: false,
        hasCustomAdapter: false,
        ...overrides,
    };
}

describe('readinessTarget: выбор persistence-пути для readiness probe', () => {
    it('кастомный адаптер — adapter-путь независимо от конфигурации', () => {
        expect(
            resolveReadinessTarget(makeInput({ hasCustomAdapter: true, hasProxyUrl: true }))
        ).toBe('adapter');
    });

    it('сконфигурированная БД — adapter-путь', () => {
        expect(resolveReadinessTarget(makeInput({ hasDatabaseUrl: true }))).toBe('adapter');
    });

    it('legacy-резолюция + только proxy — proxy-путь (переходный dev-сценарий)', () => {
        expect(
            resolveReadinessTarget(makeInput({ isLegacyBackendMode: true, hasProxyUrl: true }))
        ).toBe('proxy');
    });

    it('явный builtin без БД + PROXY_URL — none, а не proxy (зелёный readiness при мёртвом /api/bricks недопустим)', () => {
        expect(resolveReadinessTarget(makeInput({ hasProxyUrl: true }))).toBe('none');
    });

    it('ни БД, ни proxy, ни адаптера — none (readiness обязан отвечать 503)', () => {
        expect(resolveReadinessTarget(makeInput())).toBe('none');
        expect(resolveReadinessTarget(makeInput({ isLegacyBackendMode: true }))).toBe('none');
    });

    it('external — adapter-путь без БД (checkHealth HTTP-адаптера)', () => {
        expect(resolveReadinessTarget(makeInput({ hasExternalBackend: true }))).toBe('adapter');
    });

    it('external + PROXY_URL — adapter-путь (proxy persistence не выбирает)', () => {
        expect(
            resolveReadinessTarget(makeInput({ hasExternalBackend: true, hasProxyUrl: true }))
        ).toBe('adapter');
    });
});

describe('isProxyStatusReady: reachability-fallback downstream-proxy (ре-ревью A-05)', () => {
    it('2xx/3xx/4xx (endpoint жив, путь/метод не поддержан) — готов', () => {
        for (const status of [200, 204, 301, 404, 405, 429]) {
            expect(isProxyStatusReady(status)).toBe(true);
        }
    });

    it('5xx — деградация backend, не готов', () => {
        for (const status of [500, 502, 503, 504]) {
            expect(isProxyStatusReady(status)).toBe(false);
        }
    });
});

describe('isProxyHealthStatusReady: сконфигурированный health-эндпоинт (ре-ревью A-05)', () => {
    it('готовность — только 2xx', () => {
        for (const status of [200, 204, 299]) {
            expect(isProxyHealthStatusReady(status)).toBe(true);
        }
    });

    it('3xx/4xx/5xx по health-URL — не готов (включая 404 неверной конфигурации)', () => {
        for (const status of [301, 404, 405, 500, 503]) {
            expect(isProxyHealthStatusReady(status)).toBe(false);
        }
    });
});
