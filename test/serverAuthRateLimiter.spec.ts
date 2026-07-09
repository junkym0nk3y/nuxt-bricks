// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Utils
import {
    buildRateLimitKey,
    isLockedOut,
    registerFailure,
    resetFailures,
    resetRateLimiterState,
} from '../src/runtime/server/utils/auth/loginRateLimiter';
// #endregion

const KEY = buildRateLimitKey('127.0.0.1', 'Admin');

describe('loginRateLimiter: in-memory лимитер логина', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        resetRateLimiterState();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('ключ case-insensitive по username', () => {
        expect(buildRateLimitKey('1.2.3.4', 'ADMIN')).toBe(buildRateLimitKey('1.2.3.4', 'admin'));
    });

    it('до 5 неудач — не заблокирован, на 5-й включается lockout', () => {
        for (let attempt = 0; attempt < 4; attempt += 1) {
            registerFailure(KEY);
            expect(isLockedOut(KEY)).toBe(0);
        }

        registerFailure(KEY);
        const remaining = isLockedOut(KEY);

        expect(remaining).toBeGreaterThan(0);
        expect(remaining).toBeLessThanOrEqual(15 * 60);
    });

    it('lockout истекает через 15 минут', () => {
        for (let attempt = 0; attempt < 5; attempt += 1) {
            registerFailure(KEY);
        }
        expect(isLockedOut(KEY)).toBeGreaterThan(0);

        vi.advanceTimersByTime(15 * 60 * 1000 + 1000);
        expect(isLockedOut(KEY)).toBe(0);
    });

    it('окно неудач: старые попытки за пределами 15 минут не суммируются', () => {
        registerFailure(KEY);
        registerFailure(KEY);
        registerFailure(KEY);

        // Окно истекло — счётчик начинается заново
        vi.advanceTimersByTime(16 * 60 * 1000);

        registerFailure(KEY);
        registerFailure(KEY);
        registerFailure(KEY);
        registerFailure(KEY);
        expect(isLockedOut(KEY)).toBe(0);

        registerFailure(KEY);
        expect(isLockedOut(KEY)).toBeGreaterThan(0);
    });

    it('resetFailures сбрасывает счётчик после успешного логина', () => {
        for (let attempt = 0; attempt < 4; attempt += 1) {
            registerFailure(KEY);
        }

        resetFailures(KEY);

        for (let attempt = 0; attempt < 4; attempt += 1) {
            registerFailure(KEY);
        }
        expect(isLockedOut(KEY)).toBe(0);
    });

    it('sweep убирает просроченные записи других ключей', () => {
        const staleKey = buildRateLimitKey('9.9.9.9', 'stale');
        registerFailure(staleKey);

        vi.advanceTimersByTime(16 * 60 * 1000);

        // Любая регистрация делает opportunistic sweep; после него старый ключ чист
        registerFailure(KEY);
        expect(isLockedOut(staleKey)).toBe(0);

        registerFailure(staleKey);
        expect(isLockedOut(staleKey)).toBe(0);
    });
});
