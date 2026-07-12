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

describe('readinessTarget: выбор persistence-пути для readiness probe', () => {
    it('кастомный адаптер — adapter-путь независимо от конфигурации', () => {
        expect(
            resolveReadinessTarget({
                hasDatabaseUrl: false,
                hasProxyUrl: true,
                hasCustomAdapter: true,
            })
        ).toBe('adapter');
    });

    it('сконфигурированная БД — adapter-путь', () => {
        expect(
            resolveReadinessTarget({
                hasDatabaseUrl: true,
                hasProxyUrl: false,
                hasCustomAdapter: false,
            })
        ).toBe('adapter');
    });

    it('только proxy — proxy-путь', () => {
        expect(
            resolveReadinessTarget({
                hasDatabaseUrl: false,
                hasProxyUrl: true,
                hasCustomAdapter: false,
            })
        ).toBe('proxy');
    });

    it('ни БД, ни proxy, ни адаптера — none (readiness обязан отвечать 503)', () => {
        expect(
            resolveReadinessTarget({
                hasDatabaseUrl: false,
                hasProxyUrl: false,
                hasCustomAdapter: false,
            })
        ).toBe('none');
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
