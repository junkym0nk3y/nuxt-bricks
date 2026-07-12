// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import { runScryptTask } from '../src/runtime/server/utils/auth/scryptGate';
// #endregion

describe('scryptGate: bounded-семафор scrypt-дериваций', () => {
    it('не исполняет больше 4 scrypt-задач одновременно', async () => {
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

        expect(peak).toBe(4);
        expect(results).toEqual([0, 1, 2, 3, 4]);
    });
});
