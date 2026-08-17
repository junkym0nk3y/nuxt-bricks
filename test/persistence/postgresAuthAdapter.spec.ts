// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';
// #endregion

// #region Mocks
const { queryMock, queryOneMock, withTransactionMock } = vi.hoisted(() => ({
    queryMock: vi.fn(),
    queryOneMock: vi.fn(),
    withTransactionMock: vi.fn(),
}));

vi.mock('../../src/runtime/modules/persistence/server/postgres/client', () => ({
    query: queryMock,
    queryOne: queryOneMock,
    withTransaction: withTransactionMock,
}));

import { createPostgresAuthAdapter } from '../../src/runtime/modules/persistence/server/postgres/postgresAuthAdapter';
import { BricksUsernameTakenError } from '../../src/runtime/modules/persistence/server/utils/authErrors';
import type { ICreateAuthUserPayload } from '../../src/runtime/modules/persistence/types/adapters';
// #endregion

/**
 * Ошибка pg с SQLSTATE unique_violation и именем нарушенного ограничения.
 *
 * @param constraint - Имя ограничения (undefined — драйвер имени не прислал).
 * @returns Ошибка драйвера.
 */
function makeUniqueViolation(constraint: string | undefined): Error {
    return Object.assign(new Error('duplicate key value'), { code: '23505', constraint });
}

/** Данные создания учётки. */
const CREATE_PAYLOAD: ICreateAuthUserPayload = {
    username: 'ivan',
    passwordHash: 'scrypt:1:1:1:salt:hash',
    role: 'editor',
};

describe('postgresAuthAdapter: конфликт уникальности при создании учётки', () => {
    beforeEach(() => {
        queryMock.mockReset();
        queryOneMock.mockReset();
        withTransactionMock.mockReset();
    });

    it('называет занятым логином конфликт по индексам логина', async () => {
        for (const constraint of ['bricks_users_username_key', 'uq_bricks_users_username_lower']) {
            queryMock.mockRejectedValueOnce(makeUniqueViolation(constraint));

            await expect(
                createPostgresAuthAdapter().createUser(CREATE_PAYLOAD),
                constraint
            ).rejects.toBeInstanceOf(BricksUsernameTakenError);
        }
    });

    it('не выдаёт конфликт первичного ключа за занятый логин', async () => {
        // Отставшая bricks_users_id_seq (обычное состояние после восстановления
        // дампа): логин свободен, а ответ «занят» отправил бы администратора
        // придумывать другой — и поломка базы осталась бы ненайденной
        queryMock.mockRejectedValueOnce(makeUniqueViolation('bricks_users_pkey'));

        await expect(
            createPostgresAuthAdapter().createUser(CREATE_PAYLOAD)
        ).rejects.not.toBeInstanceOf(BricksUsernameTakenError);
    });

    it('трактует конфликт без имени ограничения как занятый логин', async () => {
        // Имя может не дойти (совместимый сервер, прокси), а занятый логин —
        // обычное состояние формы: пятисотый вместо него был бы хуже
        queryMock.mockRejectedValueOnce(makeUniqueViolation(undefined));

        await expect(createPostgresAuthAdapter().createUser(CREATE_PAYLOAD)).rejects.toBeInstanceOf(
            BricksUsernameTakenError
        );
    });

    it('пропускает наружу ошибку другого SQLSTATE', async () => {
        queryMock.mockRejectedValueOnce(
            Object.assign(new Error('null value in column'), { code: '23502' })
        );

        await expect(
            createPostgresAuthAdapter().createUser(CREATE_PAYLOAD)
        ).rejects.not.toBeInstanceOf(BricksUsernameTakenError);
    });
});
