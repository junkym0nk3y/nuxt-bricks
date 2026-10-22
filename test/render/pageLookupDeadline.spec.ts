// #region Imports
// Vitest
import { afterEach, describe, expect, it, vi } from 'vitest';

// Utils
import { withPageLookupDeadline } from '../../src/runtime/modules/render/utils/pageLookupDeadline';
import { isRequestTimeoutError } from '../../src/runtime/modules/common/utils/apiRequestPolicy';

// Constants
import {
    BRICKS_API_READ_TIMEOUT_MS,
    BRICKS_SSR_DEADLINE_MARGIN_MS,
} from '../../src/runtime/modules/common/constants/apiTimeouts';
// #endregion

describe('withPageLookupDeadline', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('на SSR обрывает зависший lookup, но только после запаса над потолком чтения', async () => {
        vi.useFakeTimers();

        // Обработчик не отвечает вовсе — единственный случай, ради которого
        // дедлайн и написан: внутренний вызов Nitro не слушает AbortSignal, и
        // потолок транспорта там инертен, так что границу задаёт только дедлайн
        const hungLookup = Promise.withResolvers<never>().promise;
        const guarded = withPageLookupDeadline(hungLookup, true);
        const settled = vi.fn();
        guarded.then(settled, settled);

        // На самом потолке чтения дедлайн обязан молчать: иначе он отнял бы у
        // транспорта возможность вернуть свою ошибку с настоящей причиной
        await vi.advanceTimersByTimeAsync(BRICKS_API_READ_TIMEOUT_MS);
        expect(settled).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(BRICKS_SSR_DEADLINE_MARGIN_MS);

        // Имя TimeoutError — то, по которому отказ превращается в 504, а не в 404
        await expect(guarded).rejects.toSatisfy(isRequestTimeoutError);
    });

    it('на клиенте дедлайна нет: потолок держит живой сигнал самого фетчера', () => {
        const operation = Promise.resolve('page');

        expect(withPageLookupDeadline(operation, false)).toBe(operation);
    });
});
