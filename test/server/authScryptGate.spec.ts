// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    GateOverflowError,
    runScryptTask,
    runScryptTaskIfIdle,
} from '../../src/runtime/server/utils/auth/scryptGate';
// #endregion

// #region Data
/** The concurrency limit of the shared gate, mirrored by the checks below */
const MAX_CONCURRENT = 2;
/** Its queue bound: the task after these gets a refusal instead of a place */
const MAX_QUEUE = 8;
// #endregion

// #region Methods
/**
 * A task that holds its slot until it is released by hand.
 *
 * @returns The task, the release function and a promise of "the task has started".
 */
function createHeldTask() {
    let release!: () => void;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
        markStarted = resolve;
    });
    const held = new Promise<void>((resolve) => {
        release = resolve;
    });

    return {
        started,
        release,
        task: async (): Promise<void> => {
            markStarted();
            await held;
        },
    };
}
// #endregion

describe('scryptGate: bounded-семафор scrypt-дериваций', () => {
    // Two rather than four: one derivation of the current parameters holds a libuv
    // thread for about a tenth of a second, and the pool is four threads by default.
    // Four at once would occupy all of it, and image processing would wait behind
    // the logins
    it('не исполняет больше двух scrypt-задач одновременно', async () => {
        let active = 0;
        let peak = 0;

        const tasks = Array.from({ length: 5 }, (unused, index) =>
            runScryptTask(async () => {
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

        expect(peak).toBe(MAX_CONCURRENT);
        expect(results).toEqual([0, 1, 2, 3, 4]);
    });

    it('отказывает задаче сверх очереди, а не ставит её в неё', async () => {
        const held = Array.from({ length: MAX_CONCURRENT }, () => createHeldTask());
        const running = held.map((entry) => runScryptTask(entry.task));
        await Promise.all(held.map((entry) => entry.started));

        const queued = Array.from({ length: MAX_QUEUE }, () => runScryptTask(async () => 'ok'));
        const overflowing = runScryptTask(async () => 'never');

        await expect(overflowing).rejects.toBeInstanceOf(GateOverflowError);

        for (const entry of held) {
            entry.release();
        }

        await Promise.all(running);
        await expect(Promise.all(queued)).resolves.toEqual(Array(MAX_QUEUE).fill('ok'));
    });

    // The opportunistic form: the rehash of a password after a sign-in must not take
    // a place in the queue away from somebody waiting to log in — with a busy gate it
    // is skipped instead
    it('пропускает оппортунистическую задачу при занятых слотах', async () => {
        const held = Array.from({ length: MAX_CONCURRENT }, () => createHeldTask());
        const running = held.map((entry) => runScryptTask(entry.task));
        await Promise.all(held.map((entry) => entry.started));

        let wasExecuted = false;
        const skipped = await runScryptTaskIfIdle(async () => {
            wasExecuted = true;
            return 'done';
        });

        expect(skipped).toBeNull();
        expect(wasExecuted).toBe(false);

        for (const entry of held) {
            entry.release();
        }
        await Promise.all(running);

        await expect(runScryptTaskIfIdle(async () => 'done')).resolves.toBe('done');
    });

    it('освобождает слот оппортунистической задачи после её падения', async () => {
        await expect(
            runScryptTaskIfIdle(async () => {
                throw new Error('derivation failed');
            })
        ).rejects.toThrow('derivation failed');

        await expect(runScryptTaskIfIdle(async () => 'free')).resolves.toBe('free');
    });
});
