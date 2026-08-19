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
import { BRICKS_DEFAULT_ADMIN_PASSWORD_HASH } from '../../src/runtime/modules/persistence/server/utils/defaultAdmin';
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

/** Данные создания учётки: имя и активность разрешает ручка, адаптер их не угадывает. */
const CREATE_PAYLOAD: ICreateAuthUserPayload = {
    username: 'ivan',
    passwordHash: 'scrypt:1:1:1:salt:hash',
    role: 'editor',
    displayName: null,
    isActive: true,
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

    it('спрашивает у базы, дефолтный ли пароль, и доставляет ответ наружу', async () => {
        queryOneMock.mockResolvedValueOnce({
            tokenHash: 'a'.repeat(64),
            expiresAt: new Date('2026-08-24T00:00:00.000Z'),
            lastUsedAt: '2026-08-17T00:00:00.000Z',
            userId: 7,
            username: 'admin',
            isActive: true,
            role: 'admin',
            authVersion: 1,
            displayName: null,
            avatarUrl: null,
            isDefaultPassword: true,
        });

        const session = await createPostgresAuthAdapter().getSessionWithUser('a'.repeat(64));

        expect(session?.user.isDefaultPassword).toBe(true);

        const [sql, params] = queryOneMock.mock.calls[0] as [string, unknown[]];

        // Сравнение идёт в SQL: сам хеш при этом не покидает базу, а на клиент
        // уходит только булев ответ
        expect(sql).toContain('(u.password_hash = $2) AS "isDefaultPassword"');
        expect(params[1]).toBe(BRICKS_DEFAULT_ADMIN_PASSWORD_HASH);
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

describe('postgresAuthAdapter: вход отмечает момент входа', () => {
    beforeEach(() => {
        queryMock.mockReset();
    });

    /**
     * Одним оператором, а не двумя: отметка входа ДО условной вставки сессии
     * зафиксировала бы вход, которого не случилось (учётку успели
     * деактивировать), а отдельный запрос ПОСЛЕ коммита сессии мог бы
     * потеряться — и вошедший остался бы без даты.
     */
    it('пишет last_login_at тем же запросом, что создаёт сессию, и под тем же условием', async () => {
        queryMock.mockResolvedValueOnce([{ id: 1 }]);

        const isCreated = await createPostgresAuthAdapter().createSession({
            tokenHash: 'a'.repeat(64),
            userId: 7,
            expiresAt: new Date('2026-08-25T00:00:00.000Z'),
            expectedAuthVersion: 3,
        });

        expect(isCreated).toBe(true);

        const [sql, params] = queryMock.mock.calls[0];

        expect(sql).toContain('UPDATE bricks_users');
        expect(sql).toContain('SET last_login_at = NOW()');
        expect(sql).toContain('is_active = TRUE');
        expect(sql).toContain('auth_version = $4');
        expect(sql).toContain('INSERT INTO bricks_sessions');
        // Вставка читает CTE, а не таблицу: сама по себе она безусловна, и
        // условной её делает ровно то, что строк у `authenticated` не будет,
        // если UPDATE ничего не нашёл. Вставка в обход CTE выдала бы рабочую
        // сессию по отозванным креденшелам, оставив остальные ожидания зелёными
        expect(sql).toContain('FROM authenticated');
        // Поколение НЕ двигается: вход не отзывает права, а инкремент погасил бы
        // только что созданную сессию
        expect(sql).not.toContain('auth_version + 1');
        expect(params).toEqual(['a'.repeat(64), 7, new Date('2026-08-25T00:00:00.000Z'), 3]);
    });

    it('несовпадение поколения не создаёт сессию', async () => {
        queryMock.mockResolvedValueOnce([]);

        const isCreated = await createPostgresAuthAdapter().createSession({
            tokenHash: 'b'.repeat(64),
            userId: 7,
            expiresAt: new Date('2026-08-25T00:00:00.000Z'),
            expectedAuthVersion: 2,
        });

        expect(isCreated).toBe(false);
    });
});

describe('postgresAuthAdapter: проекция учётки', () => {
    beforeEach(() => {
        queryMock.mockReset();
    });

    it('отдаёт момент входа ISO-строкой, а его отсутствие — null', async () => {
        queryMock.mockResolvedValueOnce([
            {
                id: 1,
                username: 'anna.editor',
                role: 'editor',
                isActive: true,
                displayName: null,
                avatarUrl: null,
                createdAt: new Date('2026-04-02T10:00:00.000Z'),
                lastLoginAt: new Date('2026-08-18T09:24:00.000Z'),
            },
            {
                id: 2,
                username: 'qa.viewer',
                role: 'viewer',
                isActive: true,
                displayName: null,
                avatarUrl: null,
                createdAt: new Date('2026-06-30T10:00:00.000Z'),
                lastLoginAt: null,
            },
        ]);

        const users = await createPostgresAuthAdapter().listUsers();

        expect(queryMock.mock.calls[0][0]).toContain('last_login_at AS "lastLoginAt"');
        expect(users[0].lastLoginAt).toBe('2026-08-18T09:24:00.000Z');
        expect(users[0].createdAt).toBe('2026-04-02T10:00:00.000Z');
        expect(users[1].lastLoginAt).toBeNull();
    });

    it('создание пишет отображаемое имя и активность, разрешённые ручкой', async () => {
        queryMock.mockResolvedValueOnce([
            {
                id: 3,
                username: 'anna.editor',
                role: 'editor',
                isActive: false,
                displayName: 'Анна Ким',
                avatarUrl: null,
                createdAt: new Date('2026-08-18T10:00:00.000Z'),
                lastLoginAt: null,
            },
        ]);

        const user = await createPostgresAuthAdapter().createUser({
            ...CREATE_PAYLOAD,
            username: 'anna.editor',
            displayName: 'Анна Ким',
            isActive: false,
        });

        const [sql, params] = queryMock.mock.calls[0];

        expect(sql).toContain('display_name');
        expect(sql).toContain('is_active');
        expect(params).toEqual([
            'anna.editor',
            CREATE_PAYLOAD.passwordHash,
            'editor',
            'Анна Ким',
            false,
        ]);
        expect(user.displayName).toBe('Анна Ким');
        expect(user.isActive).toBe(false);
    });
});
