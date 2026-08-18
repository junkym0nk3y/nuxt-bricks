/**
 * Вид списка учёток: поиск из общей шапки дашборда и сегмент-фильтр.
 *
 * Что здесь сторожится:
 *
 * 1. Раздел монтируется заново при каждом возврате в него, а debounce
 *    срабатывает только на ИЗМЕНЕНИЕ запроса. Значит начальное значение обязано
 *    приходить из уже набранного запроса — иначе человек возвращается к своему
 *    запросу в поле и к НЕотфильтрованному списку под ним (найдено живой
 *    проверкой).
 * 2. Поиск идёт и по отображаемому имени, и по логину: у учётки без имени логин —
 *    единственное, что о ней известно.
 * 3. Счётчики фильтров считаются от результатов поиска, а не от всего списка:
 *    иначе «Активные · 4» обещали бы четыре строки, которых поиск не пустит на
 *    экран.
 */

// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Types
import type { IBricksUserSummary } from '../../src/runtime/modules/common/types/auth';

// Vue
import { computed, ref } from 'vue';
// #endregion

import { useUsersList } from '../../src/runtime/modules/builder/users/composables/useUsersList';

/**
 * Учётка списка.
 *
 * @param overrides - Поля, отличающиеся от дефолтных.
 * @returns Учётка.
 */
function makeUser(overrides: Partial<IBricksUserSummary> = {}): IBricksUserSummary {
    return {
        id: 1,
        username: 'anna.editor',
        role: 'editor',
        isActive: true,
        displayName: null,
        avatarUrl: null,
        createdAt: '2026-04-02T10:00:00.000Z',
        lastLoginAt: null,
        ...overrides,
    };
}

/** Учётки, на которых проверяется поиск и фильтр. */
const USERS: IBricksUserSummary[] = [
    makeUser({ id: 1, username: 'anna.editor', displayName: 'Анна Ким' }),
    makeUser({ id: 2, username: 'pavel.editor' }),
    makeUser({ id: 3, username: 'qa.viewer', role: 'viewer', isActive: false }),
];

describe('useUsersList: поиск и фильтр', () => {
    it('уже набранный запрос применяется сразу после монтирования раздела', () => {
        const { filteredUsers, filterCounts } = useUsersList(
            computed(() => USERS),
            ref('анна')
        );

        expect(filteredUsers.value.map((user) => user.id)).toEqual([1]);
        expect(filterCounts.value).toEqual({ all: 1, active: 1, inactive: 0 });
    });

    it('поиск находит и по отображаемому имени, и по логину', async () => {
        const searchQuery = ref('');
        const { filteredUsers } = useUsersList(
            computed(() => USERS),
            searchQuery
        );

        vi.useFakeTimers();

        searchQuery.value = 'qa.view';
        await vi.advanceTimersByTimeAsync(400);
        expect(filteredUsers.value.map((user) => user.id)).toEqual([3]);

        searchQuery.value = 'ким';
        await vi.advanceTimersByTimeAsync(400);
        expect(filteredUsers.value.map((user) => user.id)).toEqual([1]);

        vi.useRealTimers();
    });

    it('сегмент-фильтр отбирает по возможности входа', () => {
        const { activeFilter, filteredUsers, filterCounts } = useUsersList(
            computed(() => USERS),
            ref('')
        );

        expect(filterCounts.value).toEqual({ all: 3, active: 2, inactive: 1 });

        activeFilter.value = 'inactive';
        expect(filteredUsers.value.map((user) => user.id)).toEqual([3]);

        activeFilter.value = 'active';
        expect(filteredUsers.value.map((user) => user.id)).toEqual([1, 2]);
    });
});
