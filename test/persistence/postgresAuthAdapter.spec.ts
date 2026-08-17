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
import type { ICreateAuthUserPayload } from '../../src/runtime/modules/persistence/types/authAdapters';
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

/**
 * Доставка полей сессии из SQL. Проверяется именно алиас колонки: TypeScript его
 * не видит, а без `authVersion` в проекции все записи профиля стали бы условными
 * по `undefined` — то есть отвечали бы 401 на каждую правку имени и фото.
 */
describe('postgresAuthAdapter: сессия с пользователем', () => {
    beforeEach(() => {
        queryMock.mockReset();
        queryOneMock.mockReset();
        withTransactionMock.mockReset();
    });

    it('отдаёт поколение учётных данных вместе с ролью и профилем', async () => {
        queryOneMock.mockResolvedValueOnce({
            tokenHash: 'a'.repeat(64),
            expiresAt: new Date('2026-08-24T00:00:00.000Z'),
            lastUsedAt: '2026-08-17T00:00:00.000Z',
            userId: 7,
            username: 'ivan',
            isActive: true,
            role: 'editor',
            authVersion: 4,
            displayName: 'Иван',
            avatarUrl: null,
        });

        const session = await createPostgresAuthAdapter().getSessionWithUser('a'.repeat(64));

        expect(session?.user.authVersion).toBe(4);
        expect(session?.user.role).toBe('editor');
        // TIMESTAMPTZ приведён к ISO-строке контракта
        expect(session?.expiresAt).toBe('2026-08-24T00:00:00.000Z');

        const sql = queryOneMock.mock.calls[0][0] as string;

        expect(sql).toContain('u.auth_version AS "authVersion"');
        // Сверка поколений — носитель отзыва сессий
        expect(sql).toContain('s.auth_version = u.auth_version');
    });

    it('считает отсутствующую строку отсутствующей сессией', async () => {
        queryOneMock.mockResolvedValueOnce(null);

        expect(await createPostgresAuthAdapter().getSessionWithUser('b'.repeat(64))).toBeNull();
    });
});

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
