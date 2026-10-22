// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';
// #endregion

/**
 * Протокол создания учётки по ключу операции, который прислал клиент.
 *
 * Зачем он вообще — комментарии колонок `bricks_user_create_operations` в базовой
 * миграции. Здесь сторожатся три решения, каждое из которых иначе ломается молча:
 *
 * 1. Захват ключа — ОДИН пишущий оператор. Пара «прочитал, потом записал» оставляет
 *    ровно то окно, ради закрытия которого ключ и заведён: два повтора одного
 *    намерения оба увидели бы «ничего нет» и оба пошли бы считать хеш.
 * 2. Вставка учётки и закрытие операции — ОДНА транзакция. Два шага возвращают
 *    исходный дефект внутрь сервера: смерть процесса между ними оставляет учётку,
 *    которую никто не может связать с запросом.
 * 3. Запись условна по номеру попытки. Просроченный захват можно забрать, но прежний
 *    владелец мог остаться жив (он ждал очереди у семафора), и его вставка не должна
 *    приземлиться после передачи операции другому.
 */

// #region Mocks
const { queryMock, withTransactionMock } = vi.hoisted(() => ({
    queryMock: vi.fn(),
    withTransactionMock: vi.fn(),
}));

vi.mock('../../src/runtime/modules/persistence/server/postgres/client', () => ({
    query: queryMock,
    queryOne: vi.fn(),
    withTransaction: withTransactionMock,
}));

const { createPostgresUserCreateOperations } =
    await import('../../src/runtime/modules/persistence/server/postgres/postgresUserCreateOperations');
// #endregion

// #region Helpers
/** Запрос, выполненный внутри транзакции: текст и параметры. */
interface ITrackedQuery {
    sql: string;
    params: unknown[];
}

/**
 * Прогоняет колбэк `withTransaction` на подставном исполнителе: ответ или отказ
 * выбирается по куску текста запроса, потому что порядок шагов внутри транзакции —
 * часть проверяемого поведения, а не деталь фикстуры.
 *
 * @param plan - Пары «кусок SQL → ответ либо ошибка».
 * @returns Собранные запросы транзакции.
 */
function trackTransaction(plan: { match: string; rows?: unknown[]; error?: Error }[]) {
    const queries: ITrackedQuery[] = [];

    withTransactionMock.mockImplementation(
        async (
            run: (txQuery: (sql: string, params?: unknown[]) => Promise<unknown[]>) => unknown
        ) =>
            run(async (sql: string, params: unknown[] = []) => {
                queries.push({ sql, params });

                const step = plan.find((item) => sql.includes(item.match));

                if (step?.error) {
                    throw step.error;
                }

                return step?.rows ?? [];
            })
    );

    return queries;
}

/**
 * Ошибка pg с SQLSTATE unique_violation и именем нарушенного ограничения.
 *
 * @param constraint - Имя ограничения (undefined — драйвер имени не прислал).
 * @returns Ошибка драйвера.
 */
function makeUniqueViolation(constraint: string | undefined): Error {
    return Object.assign(new Error('duplicate key value'), { code: '23505', constraint });
}

/** Захваченная операция: строка, какой её отдаёт SELECT ... FOR UPDATE. */
const RUNNING_OPERATION = {
    idempotencyKey: 'a'.repeat(32),
    requestFingerprint: 'f'.repeat(64),
    state: 'running',
    attempt: 1,
    createdUserId: null,
    rejectionCode: null,
};

/** Учётка в форме, которую отдаёт RETURNING вставки. */
const CREATED_ROW = {
    id: 11,
    username: 'ivan',
    role: 'editor',
    isActive: true,
    displayName: null,
    avatarUrl: null,
    createdAt: new Date('2026-08-23T10:00:00.000Z'),
    lastLoginAt: null,
};

/** Данные создания: адаптер получает пароль уже хешем. */
const PAYLOAD = {
    username: 'ivan',
    passwordHash: 'scrypt:1:1:1:salt:hash',
    role: 'editor' as const,
    displayName: null,
    isActive: true,
};

const KEY = 'a'.repeat(32);
const FINGERPRINT = 'f'.repeat(64);
// #endregion

describe('claimUserCreateOperation: захват ключа', () => {
    beforeEach(() => {
        queryMock.mockReset();
        withTransactionMock.mockReset();
    });

    it('свободный ключ захватывается одним пишущим оператором', async () => {
        queryMock.mockResolvedValueOnce([{ ...RUNNING_OPERATION, attempt: 1 }]);

        const claim = await createPostgresUserCreateOperations().claimUserCreateOperation({
            idempotencyKey: KEY,
            requestFingerprint: FINGERPRINT,
            leaseMs: 120_000,
        });

        expect(claim).toEqual({ status: 'claimed', attempt: 1 });
        expect(queryMock).toHaveBeenCalledTimes(1);

        const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];

        // Атомарность держится на самом операторе: условия передачи захвата стоят
        // в его WHERE, а не в отдельном чтении перед записью
        expect(sql).toContain('ON CONFLICT');
        expect(sql).toContain("state = 'running'");
        expect(sql).toContain('lease_expires_at <= NOW()');
        expect(sql).toContain('request_fingerprint = $2');
        // Аренда приходит секундами: интервал строится из числа, а не из склеенной
        // строки — склейка была бы подстановкой значения в текст запроса
        expect(params).toEqual([KEY, FINGERPRINT, 120]);
    });

    it('живой захват другого процесса отвечает «идёт»', async () => {
        queryMock.mockResolvedValueOnce([]);
        queryMock.mockResolvedValueOnce([RUNNING_OPERATION]);

        const claim = await createPostgresUserCreateOperations().claimUserCreateOperation({
            idempotencyKey: KEY,
            requestFingerprint: FINGERPRINT,
            leaseMs: 120_000,
        });

        expect(claim).toEqual({ status: 'running' });
    });

    it('завершённая операция отдаёт свою учётку, а не создаёт вторую', async () => {
        queryMock.mockResolvedValueOnce([]);
        queryMock.mockResolvedValueOnce([
            { ...RUNNING_OPERATION, state: 'completed', createdUserId: 11 },
        ]);
        queryMock.mockResolvedValueOnce([CREATED_ROW]);

        const claim = await createPostgresUserCreateOperations().claimUserCreateOperation({
            idempotencyKey: KEY,
            requestFingerprint: FINGERPRINT,
            leaseMs: 120_000,
        });

        expect(claim).toEqual({
            status: 'completed',
            user: expect.objectContaining({ id: 11, username: 'ivan' }),
        });
    });

    // Колонка объявлена ON DELETE SET NULL: операция обязана пережить учётку.
    // Создать её заново по тому же ключу — ровно то, что ключ запрещает
    it('завершённая операция без учётки говорит, что её больше нет', async () => {
        queryMock.mockResolvedValueOnce([]);
        queryMock.mockResolvedValueOnce([
            { ...RUNNING_OPERATION, state: 'completed', createdUserId: null },
        ]);

        const claim = await createPostgresUserCreateOperations().claimUserCreateOperation({
            idempotencyKey: KEY,
            requestFingerprint: FINGERPRINT,
            leaseMs: 120_000,
        });

        expect(claim).toEqual({ status: 'completedUserGone' });
    });

    it('терминальный отказ повторяется без второго хеша', async () => {
        queryMock.mockResolvedValueOnce([]);
        queryMock.mockResolvedValueOnce([
            { ...RUNNING_OPERATION, state: 'rejected', rejectionCode: 'USERNAME_TAKEN' },
        ]);

        const claim = await createPostgresUserCreateOperations().claimUserCreateOperation({
            idempotencyKey: KEY,
            requestFingerprint: FINGERPRINT,
            leaseMs: 120_000,
        });

        expect(claim).toEqual({ status: 'rejected', code: 'USERNAME_TAKEN' });
    });

    // Расхождение тела проверяется ПЕРЕД состоянием: иначе тот же ключ с другим
    // телом получил бы результат чужого запроса
    it('тот же ключ с другим телом не получает результат первой операции', async () => {
        queryMock.mockResolvedValueOnce([]);
        queryMock.mockResolvedValueOnce([
            {
                ...RUNNING_OPERATION,
                state: 'completed',
                createdUserId: 11,
                requestFingerprint: 'e'.repeat(64),
            },
        ]);

        const claim = await createPostgresUserCreateOperations().claimUserCreateOperation({
            idempotencyKey: KEY,
            requestFingerprint: FINGERPRINT,
            leaseMs: 120_000,
        });

        expect(claim).toEqual({ status: 'payloadMismatch' });
    });
});

describe('createUserForOperation: вставка под захватом', () => {
    beforeEach(() => {
        queryMock.mockReset();
        withTransactionMock.mockReset();
    });

    it('учётка и закрытие операции пишутся одной транзакцией', async () => {
        const queries = trackTransaction([
            { match: 'FOR UPDATE', rows: [RUNNING_OPERATION] },
            { match: 'INSERT INTO bricks_users', rows: [CREATED_ROW] },
        ]);

        const outcome = await createPostgresUserCreateOperations().createUserForOperation({
            idempotencyKey: KEY,
            attempt: 1,
            payload: PAYLOAD,
        });

        expect(outcome).toEqual({
            status: 'created',
            user: expect.objectContaining({ id: 11, createdAt: '2026-08-23T10:00:00.000Z' }),
        });

        // Одна транзакция на оба письма, и вставка идёт после проверки захвата
        expect(withTransactionMock).toHaveBeenCalledTimes(1);
        expect(queries.map((item) => item.sql.trim().split(/\s+/).slice(0, 3).join(' '))).toEqual([
            'SELECT idempotency_key AS',
            'SAVEPOINT bricks_user_insert',
            'INSERT INTO bricks_users',
            'UPDATE bricks_user_create_operations SET',
        ]);

        // Имя и активность разрешает ручка, адаптер их не угадывает: `undefined`
        // уехал бы в INSERT как NULL, а `is_active` объявлен NOT NULL — дефолт
        // таблицы при явном значении не применяется вовсе
        const insert = queries[2];
        expect(insert.sql).toContain('display_name');
        expect(insert.sql).toContain('is_active');
        expect(insert.params).toEqual(['ivan', PAYLOAD.passwordHash, 'editor', null, true]);

        const closing = queries[3];
        expect(closing.sql).toContain("state = 'completed'");
        expect(closing.sql).toContain('lease_expires_at = NULL');
        expect(closing.params).toEqual([KEY, 11]);
    });

    // Занятый логин обрывает оператор вставки: без savepoint транзакция была бы
    // мертва целиком, отказ записать было бы некуда, и операция висела бы «идёт» до
    // конца аренды — то есть повтор получал бы «ещё считаю» вместо ответа
    it('занятый логин записывается в операцию и повторяется как отказ', async () => {
        const queries = trackTransaction([
            { match: 'FOR UPDATE', rows: [RUNNING_OPERATION] },
            {
                match: 'INSERT INTO bricks_users',
                error: makeUniqueViolation('uq_bricks_users_username_lower'),
            },
        ]);

        const outcome = await createPostgresUserCreateOperations().createUserForOperation({
            idempotencyKey: KEY,
            attempt: 1,
            payload: PAYLOAD,
        });

        expect(outcome).toEqual({ status: 'rejected', code: 'USERNAME_TAKEN' });

        const texts = queries.map((item) => item.sql);
        expect(texts.some((sql) => sql.includes('ROLLBACK TO SAVEPOINT'))).toBe(true);

        const closing = queries[queries.length - 1];
        expect(closing.sql).toContain("state = 'rejected'");
        expect(closing.params).toEqual([KEY, 'USERNAME_TAKEN']);
    });

    // Отставшая bricks_users_id_seq (обычное состояние после восстановления дампа):
    // логин свободен, и записать «занят» значило бы замаскировать поломку базы
    it('конфликт первичного ключа не выдаётся за занятый логин', async () => {
        trackTransaction([
            { match: 'FOR UPDATE', rows: [RUNNING_OPERATION] },
            { match: 'INSERT INTO bricks_users', error: makeUniqueViolation('bricks_users_pkey') },
        ]);

        await expect(
            createPostgresUserCreateOperations().createUserForOperation({
                idempotencyKey: KEY,
                attempt: 1,
                payload: PAYLOAD,
            })
        ).rejects.toMatchObject({ code: '23505' });
    });

    it('конфликт без имени ограничения считается занятым логином', async () => {
        trackTransaction([
            { match: 'FOR UPDATE', rows: [RUNNING_OPERATION] },
            { match: 'INSERT INTO bricks_users', error: makeUniqueViolation(undefined) },
        ]);

        const outcome = await createPostgresUserCreateOperations().createUserForOperation({
            idempotencyKey: KEY,
            attempt: 1,
            payload: PAYLOAD,
        });

        expect(outcome).toEqual({ status: 'rejected', code: 'USERNAME_TAKEN' });
    });

    // Пока считался хеш, аренда истекла и операцию забрал другой процесс. Вставить
    // учётку всё равно значило бы создать её под чужим захватом — второй владелец
    // создал бы её тоже, и одна из двух осталась бы нерабочей
    it('перехваченный захват не пишет ничего', async () => {
        const queries = trackTransaction([
            { match: 'FOR UPDATE', rows: [{ ...RUNNING_OPERATION, attempt: 2 }] },
        ]);

        const outcome = await createPostgresUserCreateOperations().createUserForOperation({
            idempotencyKey: KEY,
            attempt: 1,
            payload: PAYLOAD,
        });

        expect(outcome).toEqual({ status: 'staleClaim' });
        expect(queries).toHaveLength(1);
    });

    it('исчезнувшая операция — тоже перехваченный захват', async () => {
        trackTransaction([{ match: 'FOR UPDATE', rows: [] }]);

        const outcome = await createPostgresUserCreateOperations().createUserForOperation({
            idempotencyKey: KEY,
            attempt: 1,
            payload: PAYLOAD,
        });

        expect(outcome).toEqual({ status: 'staleClaim' });
    });
});

describe('releaseUserCreateOperation: отказ от захвата', () => {
    beforeEach(() => {
        queryMock.mockReset();
        withTransactionMock.mockReset();
    });

    // Строка сохраняется, а не удаляется: ключ обязан остаться связанным с
    // отпечатком тела, иначе тот же ключ с другим телом перестал бы распознаваться
    it('гасит аренду своей попытки, не удаляя операцию', async () => {
        queryMock.mockResolvedValueOnce([]);

        await createPostgresUserCreateOperations().releaseUserCreateOperation({
            idempotencyKey: KEY,
            attempt: 3,
        });

        const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];

        expect(sql).toContain('lease_expires_at = NOW()');
        expect(sql).not.toContain('DELETE');
        expect(sql).toContain('attempt = $2');
        expect(sql).toContain("state = 'running'");
        expect(params).toEqual([KEY, 3]);
    });
});
