// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import { resolveReadinessTarget } from '../../src/runtime/server/utils/readinessTarget';
// #endregion

/** Вход резолвера с дефолтами builtin без конфигурации. */
function makeInput(overrides: Partial<Parameters<typeof resolveReadinessTarget>[0]> = {}) {
    return {
        hasExternalBackend: false,
        hasDatabaseUrl: false,
        hasCustomAdapter: false,
        ...overrides,
    };
}

describe('readinessTarget: выбор persistence-пути для readiness probe', () => {
    it('кастомный адаптер — adapter-путь независимо от конфигурации', () => {
        expect(resolveReadinessTarget(makeInput({ hasCustomAdapter: true }))).toBe('adapter');
    });

    it('сконфигурированная БД — adapter-путь', () => {
        expect(resolveReadinessTarget(makeInput({ hasDatabaseUrl: true }))).toBe('adapter');
    });

    it('ни БД, ни адаптера — none (readiness обязан отвечать 503)', () => {
        expect(resolveReadinessTarget(makeInput())).toBe('none');
    });

    it('external — adapter-путь без БД (checkHealth HTTP-адаптера)', () => {
        expect(resolveReadinessTarget(makeInput({ hasExternalBackend: true }))).toBe('adapter');
    });
});
