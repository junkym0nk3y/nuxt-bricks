// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';
// #endregion

/**
 * Мутации строки учётки: что именно уходит в SQL.
 *
 * Проверяется не форма запроса ради формы, а четыре решения, которые иначе
 * ломаются молча: правка профиля НЕ поднимает поколение (иначе переименование
 * выбрасывает человека из его сессии), смена своего пароля пишется УСЛОВНО по
 * поколению (иначе она отменяет сброс, сделанный администратором), удаление
 * отдаёт снятую строку (без неё файл фото остаётся в хранилище навсегда), а рехеш
 * не трогает ни поколение, ни сессии (иначе он выбрасывает тот самый вход, который
 * его и заказал).
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

const { createPostgresAuthUserMethods } =
    await import('../../src/runtime/modules/persistence/server/postgres/postgresAuthUserMethods');
// #endregion

// #region Helpers
/** Запрос, выполненный внутри транзакции: текст и параметры. */
interface ITrackedQuery {
    sql: string;
    params: unknown[];
}

/**
 * Прогоняет колбэк `withTransaction` на подставном исполнителе запросов.
 *
 * @param responses - Ответы на запросы по порядку.
 * @returns Собранные запросы и функция запуска.
 */
function trackTransaction(responses: unknown[][]): ITrackedQuery[] {
    const queries: ITrackedQuery[] = [];
    let index = 0;

    withTransactionMock.mockImplementation(
        async (
            run: (txQuery: (sql: string, params?: unknown[]) => Promise<unknown[]>) => unknown
        ) =>
            run(async (sql: string, params: unknown[] = []) => {
                queries.push({ sql, params });

                return responses[index++] ?? [];
            })
    );

    return queries;
}

/** Строка учётки в форме, которую отдаёт `RETURNING`. */
const USER_ROW = {
    id: 7,
    username: 'ivan',
    role: 'editor',
    isActive: true,
    displayName: 'Иван',
    avatarUrl: 'https://s3.example/bucket/bricks-avatars/user-7-new.webp',
    createdAt: new Date('2026-08-17T00:00:00.000Z'),
};
// #endregion

beforeEach(() => {
    queryMock.mockReset();
    withTransactionMock.mockReset();
});

describe('updateUserProfile: имя и фото своего профиля', () => {
    it('не поднимает поколение и не рвёт сессии', async () => {
        // Иначе человек, переименовавший себя, оказался бы выброшен из своей
        // сессии — имя и фото креденшелами не являются
        const queries = trackTransaction([[{ avatarUrl: null }], [USER_ROW]]);

        await createPostgresAuthUserMethods().updateUserProfile(7, { displayName: 'Иван' }, 4);

        const update = queries.at(-1);

        expect(update?.sql).toContain('UPDATE bricks_users');
        expect(update?.sql).not.toContain('auth_version');
        expect(queries.some((entry) => entry.sql.includes('DELETE FROM bricks_sessions'))).toBe(
            false
        );
    });

    it('читает прежнюю ссылку на фото под блокировкой строки', async () => {
        // Без блокировки две одновременные загрузки сочли бы прежним один и тот же
        // файл, и один из загруженных остался бы в хранилище без ссылок
        const queries = trackTransaction([
            [{ avatarUrl: 'https://s3.example/bucket/bricks-avatars/user-7-old.webp' }],
            [USER_ROW],
        ]);

        const result = await createPostgresAuthUserMethods().updateUserProfile(
            7,
            { avatarUrl: USER_ROW.avatarUrl },
            4
        );

        expect(queries[0].sql).toContain('FOR UPDATE');
        expect(queries[0].params).toEqual([7, 4]);
        expect(result?.previousAvatarUrl).toBe(
            'https://s3.example/bucket/bricks-avatars/user-7-old.webp'
        );
        expect(result?.user.avatarUrl).toBe(USER_ROW.avatarUrl);
        // TIMESTAMPTZ приведён к ISO-строке контракта
        expect(result?.user.createdAt).toBe('2026-08-17T00:00:00.000Z');
    });

    it('пишет только переданные поля', async () => {
        const queries = trackTransaction([[{ avatarUrl: null }], [USER_ROW]]);

        await createPostgresAuthUserMethods().updateUserProfile(7, { avatarUrl: null }, 4);

        const update = queries.at(-1);

        expect(update?.sql).toContain('avatar_url = $1');
        // Проверяется присваивание, а не упоминание: в RETURNING колонка есть всегда
        expect(update?.sql).not.toContain('display_name =');
        expect(update?.params).toEqual([null, 7]);
    });

    it('пишет условно по поколению и активности', async () => {
        // Между резолвом сессии и этой записью проходит время (у загрузки фото —
        // секунды на sharp и заливку): за него учётку могли деактивировать или
        // сбросить ей пароль, и правка не должна доезжать отозванными креденшелами
        const queries = trackTransaction([[{ avatarUrl: null }], [USER_ROW]]);

        await createPostgresAuthUserMethods().updateUserProfile(7, { displayName: 'Иван' }, 4);

        expect(queries[0].sql).toContain('is_active = TRUE');
        expect(queries[0].sql).toContain('auth_version = $2');
        expect(queries[0].sql).toContain('FOR UPDATE');
        expect(queries[0].params).toEqual([7, 4]);
    });

    it('отдаёт null, если живой учётки с этим поколением нет', async () => {
        // Одна ветка на «удалена», «отключена» и «поколение сдвинулось»: снаружи
        // это одно и то же — сессия больше не относится к живой учётке
        const queries = trackTransaction([[]]);

        expect(
            await createPostgresAuthUserMethods().updateUserProfile(7, { displayName: 'Иван' }, 4)
        ).toBeNull();
        // Отказ до записи: UPDATE не выполнялся
        expect(queries).toHaveLength(1);
    });
});

describe('updateOwnPassword: смена своего пароля', () => {
    it('пишет условно по поколению и активности, затем убирает сессии', async () => {
        const queries = trackTransaction([[{ id: 7 }], []]);

        const isApplied = await createPostgresAuthUserMethods().updateOwnPassword(7, {
            passwordHash: 'scrypt:1:1:1:salt:hash',
            expectedAuthVersion: 4,
        });

        expect(isApplied).toBe(true);
        expect(queries[0].sql).toContain('auth_version = auth_version + 1');
        expect(queries[0].sql).toContain('is_active = TRUE');
        expect(queries[0].sql).toContain('auth_version = $3');
        expect(queries[0].params).toEqual([7, 'scrypt:1:1:1:salt:hash', 4]);
        expect(queries[1].sql).toContain('DELETE FROM bricks_sessions');
    });

    it('отказывает без записи, если поколение сдвинулось', async () => {
        // Пароль сбросил администратор, чтобы отобрать учётку: безусловная запись
        // отменила бы сброс паролем, который знает пришедший
        const queries = trackTransaction([[]]);

        expect(
            await createPostgresAuthUserMethods().updateOwnPassword(7, {
                passwordHash: 'scrypt:1:1:1:salt:hash',
                expectedAuthVersion: 4,
            })
        ).toBe(false);
        expect(queries).toHaveLength(1);
    });
});

describe('deleteUser: удаление учётки', () => {
    it('отдаёт снятую строку — по ней убирается файл фото', async () => {
        const queries = trackTransaction([
            // Набор активных админов и состояние цели: удаляем редактора
            [{ id: 1 }],
            [{ id: 7, role: 'editor', isActive: true }],
            [USER_ROW],
        ]);

        const deleted = await createPostgresAuthUserMethods().deleteUser(7);

        expect(queries.at(-1)?.sql).toContain('DELETE FROM bricks_users');
        expect(queries.at(-1)?.sql).toContain('RETURNING');
        expect(deleted?.avatarUrl).toBe(USER_ROW.avatarUrl);
    });

    it('отдаёт null, если учётки нет', async () => {
        trackTransaction([[{ id: 1 }], []]);

        expect(await createPostgresAuthUserMethods().deleteUser(7)).toBeNull();
    });
});

describe('rehashUserPassword: обновление хеша тем же паролем', () => {
    // Neither the generation nor the deletion of sessions: the sign-in that ordered
    // the rehash created its session against the generation it read a moment earlier,
    // and raising it would throw the person out with the very cookie about to be
    // handed to them
    it('пишет один UPDATE без поколения, сессий и транзакции', async () => {
        queryMock.mockResolvedValueOnce([{ id: 7 }]);

        const isRehashed = await createPostgresAuthUserMethods().rehashUserPassword(7, {
            currentPasswordHash: 'scrypt:16384:8:1:old-salt:old-hash',
            nextPasswordHash: 'scrypt:16384:8:5:new-salt:new-hash',
            expectedAuthVersion: 4,
        });

        expect(isRehashed).toBe(true);
        expect(withTransactionMock).not.toHaveBeenCalled();
        expect(queryMock).toHaveBeenCalledTimes(1);

        const [sql, params] = queryMock.mock.calls[0];
        expect(sql).not.toContain('auth_version + 1');
        expect(sql).not.toContain('DELETE FROM bricks_sessions');
        expect(sql).toContain('SET password_hash = $3');
        expect(params).toEqual([
            7,
            'scrypt:16384:8:1:old-salt:old-hash',
            'scrypt:16384:8:5:new-salt:new-hash',
            4,
        ]);
    });

    // The previous hash in the condition guards against a second parallel sign-in:
    // without it that one would overwrite the salt the first has just written
    it('условие несёт прежний хеш, поколение и активность', async () => {
        queryMock.mockResolvedValueOnce([{ id: 7 }]);

        await createPostgresAuthUserMethods().rehashUserPassword(7, {
            currentPasswordHash: 'scrypt:16384:8:1:old-salt:old-hash',
            nextPasswordHash: 'scrypt:16384:8:5:new-salt:new-hash',
            expectedAuthVersion: 4,
        });

        const [sql] = queryMock.mock.calls[0];
        expect(sql).toContain('password_hash = $2');
        expect(sql).toContain('auth_version = $4');
        expect(sql).toContain('is_active = TRUE');
    });

    it('отдаёт false, когда строка условию не подошла', async () => {
        queryMock.mockResolvedValueOnce([]);

        await expect(
            createPostgresAuthUserMethods().rehashUserPassword(7, {
                currentPasswordHash: 'scrypt:16384:8:1:old-salt:old-hash',
                nextPasswordHash: 'scrypt:16384:8:5:new-salt:new-hash',
                expectedAuthVersion: 4,
            })
        ).resolves.toBe(false);
    });
});
