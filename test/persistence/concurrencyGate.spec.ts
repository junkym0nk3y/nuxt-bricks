// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    createConcurrencyGate,
    GateOverflowError,
} from '../../src/runtime/modules/persistence/server/utils/concurrencyGate';
// #endregion

/**
 * Отложенный промис с ручным резолвом.
 */
function createDeferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void;
    const promise = new Promise<void>((promiseResolve) => {
        resolve = promiseResolve;
    });

    return { promise, resolve };
}

describe('concurrencyGate: семафор тяжёлых операций', () => {
    it('не исполняет больше maxConcurrent задач одновременно', async () => {
        const gate = createConcurrencyGate({ maxConcurrent: 2, maxQueue: 10 });
        let active = 0;
        let peak = 0;

        const tasks = Array.from({ length: 6 }, (unused, index) =>
            gate.run(async () => {
                active += 1;
                peak = Math.max(peak, active);
                await new Promise<void>((resolve) => {
                    setTimeout(resolve, 5);
                });
                active -= 1;
                return index;
            })
        );

        const results = await Promise.all(tasks);

        expect(peak).toBe(2);
        expect(results).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it('переполнение очереди — GateOverflowError без ожидания', async () => {
        const gate = createConcurrencyGate({ maxConcurrent: 1, maxQueue: 1 });
        const blocker = createDeferred();

        const first = gate.run(() => blocker.promise);
        const second = gate.run(async () => 'queued');
        const third = gate.run(async () => 'rejected');

        await expect(third).rejects.toBeInstanceOf(GateOverflowError);

        blocker.resolve();
        await first;
        expect(await second).toBe('queued');
    });

    it('ошибка задачи пробрасывается и освобождает слот', async () => {
        const gate = createConcurrencyGate({ maxConcurrent: 1, maxQueue: 1 });

        await expect(
            gate.run(async () => {
                throw new Error('task failed');
            })
        ).rejects.toThrow('task failed');

        // Слот освобождён — следующая задача исполняется
        expect(await gate.run(async () => 'ok')).toBe('ok');
    });
});
