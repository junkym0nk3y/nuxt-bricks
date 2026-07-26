// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Stores
import { adjustReorderTargetIndex } from '../../src/runtime/modules/builder/core/stores/actions/order';
// #endregion

describe('adjustReorderTargetIndex', () => {
    it('сдвигает destination назад после извлечения более раннего sibling-а', () => {
        expect(adjustReorderTargetIndex(0, 3)).toBe(2);
        expect(adjustReorderTargetIndex(1, 2)).toBe(1);
    });

    it('сохраняет destination при переносе вверх или из другого контейнера', () => {
        expect(adjustReorderTargetIndex(3, 1)).toBe(1);
        expect(adjustReorderTargetIndex(-1, 2)).toBe(2);
    });
});
