// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// #endregion

// #region Mocks
// requestRateLimiter → requestClientIp → nitropack/runtime (вне Nitro не резолвится)
vi.mock('nitropack/runtime', () => ({
    useRuntimeConfig: () => ({}),
}));

const { createFixedWindowRateLimiter } =
    await import('../src/runtime/server/utils/requestRateLimiter');
// #endregion

describe('requestRateLimiter: fixed-window лимитер ingest-ручек', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('пропускает limit запросов и отклоняет сверхлимитные с Retry-After', () => {
        const limiter = createFixedWindowRateLimiter({ limit: 3, windowMs: 60_000 });

        expect(limiter.hit('ip')).toBe(0);
        expect(limiter.hit('ip')).toBe(0);
        expect(limiter.hit('ip')).toBe(0);

        const retryAfter = limiter.hit('ip');
        expect(retryAfter).toBeGreaterThan(0);
        expect(retryAfter).toBeLessThanOrEqual(60);
    });

    it('Retry-After отсчитывается до конца текущего окна', () => {
        const limiter = createFixedWindowRateLimiter({ limit: 1, windowMs: 60_000 });

        limiter.hit('ip');
        vi.advanceTimersByTime(45_000);

        expect(limiter.hit('ip')).toBe(15);
    });

    it('окно истекает — счётчик начинается заново', () => {
        const limiter = createFixedWindowRateLimiter({ limit: 1, windowMs: 60_000 });

        limiter.hit('ip');
        expect(limiter.hit('ip')).toBeGreaterThan(0);

        vi.advanceTimersByTime(61_000);
        expect(limiter.hit('ip')).toBe(0);
    });

    it('ключи независимы', () => {
        const limiter = createFixedWindowRateLimiter({ limit: 1, windowMs: 60_000 });

        expect(limiter.hit('first')).toBe(0);
        expect(limiter.hit('second')).toBe(0);
        expect(limiter.hit('first')).toBeGreaterThan(0);
    });

    it('maxEntries выселяет старейшие ключи (защита памяти)', () => {
        const limiter = createFixedWindowRateLimiter({
            limit: 1,
            windowMs: 60_000,
            maxEntries: 2,
        });

        limiter.hit('x');
        expect(limiter.hit('x')).toBeGreaterThan(0);

        // Два новых ключа вытесняют 'x' — его счётчик забыт
        limiter.hit('a');
        limiter.hit('b');
        expect(limiter.hit('x')).toBe(0);
    });
});
