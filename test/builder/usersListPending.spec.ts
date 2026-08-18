/**
 * @vitest-environment happy-dom
 *
 * Как список раздаёт занятость своим строкам.
 *
 * Занятость в разделе одна на всех: пока идёт операция, вторая не начинается ни
 * над её строкой, ни над соседней. Значит список обязан раздать строкам ДВА
 * разных признака — «обновляется вот эта» и «сейчас недоступны все». Пока
 * раздавался только первый, кнопки соседних строк выглядели рабочими, а клик по
 * ним молча ничего не делал: ни тоста, ни визуального состояния.
 */

// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Types
import type { IBricksUserSummary } from '../../src/runtime/modules/common/types/auth';

// Vue
import { mount } from '@vue/test-utils';
// #endregion

// #region Mocks
vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        t: (key: string) => key,
    }),
}));
// #endregion

import BuilderUsersList from '../../src/runtime/modules/builder/users/components/BuilderUsersList.vue';
import BuilderUsersListRow from '../../src/runtime/modules/builder/users/components/BuilderUsersListRow.vue';

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

describe('BuilderUsersList: раздача занятости строкам', () => {
    it('операция над одной строкой закрывает действия всех', () => {
        const users = [makeUser(), makeUser({ id: 2, username: 'pavel.editor' })];

        const wrapper = mount(BuilderUsersList, {
            props: {
                users,
                activeFilter: 'all',
                counts: { all: 2, active: 2, inactive: 0 },
                status: 'ready',
                hasAnyUsers: true,
                currentUserId: null,
                lastActiveAdminId: null,
                pendingUserId: 1,
            },
            global: {
                stubs: {
                    BricksIcon: true,
                    BricksTabBar: true,
                    BricksButton: true,
                    BuilderUsersListRow: true,
                },
            },
        });

        const rows = wrapper.findAllComponents(BuilderUsersListRow);

        expect(rows).toHaveLength(2);

        // Обновляется только строка операции...
        expect(rows[0].props('isPending')).toBe(true);
        expect(rows[1].props('isPending')).toBe(false);

        // ...но недоступны на это время действия обеих
        expect(rows[0].props('isOperationLocked')).toBe(true);
        expect(rows[1].props('isOperationLocked')).toBe(true);
    });

    it('свободный раздел не гасит ничего', () => {
        const wrapper = mount(BuilderUsersList, {
            props: {
                users: [makeUser()],
                activeFilter: 'all',
                counts: { all: 1, active: 1, inactive: 0 },
                status: 'ready',
                hasAnyUsers: true,
                currentUserId: null,
                lastActiveAdminId: null,
                pendingUserId: null,
            },
            global: {
                stubs: {
                    BricksIcon: true,
                    BricksTabBar: true,
                    BricksButton: true,
                    BuilderUsersListRow: true,
                },
            },
        });

        const row = wrapper.findComponent(BuilderUsersListRow);

        expect(row.props('isPending')).toBe(false);
        expect(row.props('isOperationLocked')).toBe(false);
    });
});
