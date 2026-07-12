// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import { resolveReadinessTarget } from '../src/runtime/server/utils/readinessTarget';
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
