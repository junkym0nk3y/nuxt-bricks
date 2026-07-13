// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import { runWithConcurrencyLimit } from '../../src/runtime/modules/render/utils/requestPool';
// #endregion

/**
 * Создаёт отложенную задачу, фиксирующую пиковую одновременность выполнения.
 */
function createTrackedTask<T>(value: T, state: { active: number; peak: number }): () => Promise<T> {
    return async () => {
        state.active += 1;
        state.peak = Math.max(state.peak, state.active);
        await new Promise((resolveTimer) => {
            setTimeout(resolveTimer, 5);
        });
        state.active -= 1;
        return value;
    };
}

describe('runWithConcurrencyLimit', () => {
    it('не превышает лимит одновременных задач и сохраняет порядок результатов', async () => {
        const state = { active: 0, peak: 0 };
        const tasks = Array.from({ length: 10 }, (_, index) => createTrackedTask(index, state));

        const results = await runWithConcurrencyLimit(tasks, 3);

        expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        expect(state.peak).toBeLessThanOrEqual(3);
        expect(state.peak).toBeGreaterThan(1);
    });

    it('работает с лимитом больше числа задач и с невалидным лимитом', async () => {
        expect(await runWithConcurrencyLimit([async () => 'a'], 100)).toEqual(['a']);

        const state = { active: 0, peak: 0 };
        const tasks = Array.from({ length: 4 }, (_, index) => createTrackedTask(index, state));
        expect(await runWithConcurrencyLimit(tasks, 0)).toEqual([0, 1, 2, 3]);
        expect(state.peak).toBe(1);
    });

    it('пустая очередь резолвится пустым массивом', async () => {
        expect(await runWithConcurrencyLimit([], 4)).toEqual([]);
    });

    it('ошибка задачи отклоняет общий промис', async () => {
        const tasks = [
            async () => 'ok',
            async (): Promise<string> => Promise.reject(new Error('boom')),
        ];

        await expect(runWithConcurrencyLimit(tasks, 2)).rejects.toThrow('boom');
    });
});
