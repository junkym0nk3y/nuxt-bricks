// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Utils
import {
    combineAbortSignals,
    createTimeoutSignal,
} from '../../src/runtime/modules/common/utils/abortSignals';
// #endregion

describe('combineAbortSignals', () => {
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

describe('createTimeoutSignal', () => {
    it('абортится по истечении потолка ошибкой с именем TimeoutError', async () => {
        // Реальный малый потолок, а не проматывание времени: внутренний таймер
        // `AbortSignal.timeout` живёт в Node, и подмена таймеров его не трогает
        const signal = createTimeoutSignal(5);

        expect(signal.aborted).toBe(false);

        await vi.waitFor(() => expect(signal.aborted).toBe(true));

        expect((signal.reason as Error | undefined)?.name).toBe('TimeoutError');
    });

    it('мусорное значение конфигурации приводится к допустимой задержке', () => {
        // `AbortSignal.timeout` на нецелом, бесконечном, отрицательном и слишком
        // большом значении бросает RangeError — а `timeoutMs` приходит из
        // пользовательской конфигурации, где валидации нет. Проверяем именно
        // переданную задержку: «не бросило» пропустило бы приведение мусора к
        // единице, то есть к мгновенному обрыву всех запросов подряд
        const nativeTimeout = vi.spyOn(AbortSignal, 'timeout');
        const maxDelayMs = 2_147_483_647;

        const cases: [number, number][] = [
            [1.5, 2],
            [10_000, 10_000],
            [-1, maxDelayMs],
            [0, maxDelayMs],
            [Number.NaN, maxDelayMs],
            [Number.POSITIVE_INFINITY, maxDelayMs],
            [2 ** 53, maxDelayMs],
        ];

        for (const [timeoutMs, expectedDelayMs] of cases) {
            nativeTimeout.mockClear();

            expect(createTimeoutSignal(timeoutMs).aborted).toBe(false);
            expect(nativeTimeout).toHaveBeenCalledWith(expectedDelayMs);
        }

        nativeTimeout.mockRestore();
    });
});

describe('createTimeoutSignal: fallback без AbortSignal.timeout', () => {
    const originalTimeout = AbortSignal.timeout;

    beforeEach(() => {
        Reflect.set(AbortSignal, 'timeout', undefined);
    });

    afterEach(() => {
        Reflect.set(AbortSignal, 'timeout', originalTimeout);
        vi.useRealTimers();
    });

    it('свой таймер абортит сигнал той же ошибкой TimeoutError', () => {
        // После подмены нативного API работает обычный `setTimeout`, поэтому
        // время здесь можно проматывать
        vi.useFakeTimers();

        const signal = createTimeoutSignal(1000);

        expect(signal.aborted).toBe(false);

        vi.advanceTimersByTime(1000);

        expect(signal.aborted).toBe(true);
        expect((signal.reason as Error | undefined)?.name).toBe('TimeoutError');
    });

    it('мусорное значение и здесь даёт ту же задержку — расхождение ветвей недопустимо', () => {
        // Ветвь на своём таймере мусор принимает молча, поэтому проверяется не
        // отсутствие исключения, а сама задержка: `setTimeout` от мусора
        // отработал бы почти сразу и оборвал бы запрос вместо ожидания
        vi.useFakeTimers();

        for (const timeoutMs of [-1, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
            const signal = createTimeoutSignal(timeoutMs);

            vi.advanceTimersByTime(60_000);
            expect(signal.aborted).toBe(false);
        }

        // Нецелое округляется вверх, а не отбрасывается в ноль
        const rounded = createTimeoutSignal(1.5);

        vi.advanceTimersByTime(1);
        expect(rounded.aborted).toBe(false);

        vi.advanceTimersByTime(1);
        expect(rounded.aborted).toBe(true);
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
