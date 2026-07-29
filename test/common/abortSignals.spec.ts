// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Utils
import { combineAbortSignals } from '../../src/runtime/modules/common/utils/abortSignals';
// #endregion

describe('combineAbortSignals (аудит A-09 review)', () => {
    it('единственный сигнал возвращается как есть', () => {
        const controller = new AbortController();

        expect(combineAbortSignals([controller.signal])).toBe(controller.signal);
    });

    it('abort любого из входных сигналов абортит комбинированный', () => {
        const first = new AbortController();
        const second = new AbortController();

        const combinedFirst = combineAbortSignals([first.signal, second.signal]);
        expect(combinedFirst.aborted).toBe(false);
        first.abort(new Error('deadline'));
        expect(combinedFirst.aborted).toBe(true);

        const third = new AbortController();
        const fourth = new AbortController();
        const combinedSecond = combineAbortSignals([third.signal, fourth.signal]);
        fourth.abort(new Error('timeout'));
        expect(combinedSecond.aborted).toBe(true);
    });

    it('уже отменённый входной сигнал — комбинированный сразу aborted', () => {
        const aborted = new AbortController();
        aborted.abort(new Error('already aborted'));
        const pending = new AbortController();

        const combined = combineAbortSignals([aborted.signal, pending.signal]);

        expect(combined.aborted).toBe(true);
    });

    it('не абортится, пока не абортирован ни один входной сигнал', () => {
        const first = new AbortController();
        const second = new AbortController();

        const combined = combineAbortSignals([first.signal, second.signal]);

        expect(combined.aborted).toBe(false);
    });
});

describe('combineAbortSignals: fallback без AbortSignal.any', () => {
    const originalAny = AbortSignal.any;

    beforeEach(() => {
        Reflect.set(AbortSignal, 'any', undefined);
    });

    afterEach(() => {
        Reflect.set(AbortSignal, 'any', originalAny);
    });

    it('abort любого входного сигнала абортит комбинированный', () => {
        const first = new AbortController();
        const second = new AbortController();

        const combined = combineAbortSignals([first.signal, second.signal]);

        expect(combined.aborted).toBe(false);
        second.abort(new Error('timeout'));
        expect(combined.aborted).toBe(true);
    });

    it('уже отменённый входной сигнал — комбинированный сразу aborted', () => {
        const aborted = new AbortController();
        aborted.abort(new Error('already aborted'));
        const pending = new AbortController();

        const combined = combineAbortSignals([pending.signal, aborted.signal]);

        expect(combined.aborted).toBe(true);
    });
});
