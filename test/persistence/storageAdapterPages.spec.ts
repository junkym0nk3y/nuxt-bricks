// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Types
import type { TTransactionQuery } from '../../src/runtime/modules/persistence/server/postgres/client';
// #endregion

const { queryMock, queryOneMock, withTransactionMock, runtimeConfigMock } = vi.hoisted(() => ({
    queryMock: vi.fn(),
    queryOneMock: vi.fn(),
    withTransactionMock: vi.fn(),
    runtimeConfigMock: vi.fn(),
}));

vi.mock('../../src/runtime/modules/persistence/server/postgres/client', () => ({
    query: queryMock,
    queryOne: queryOneMock,
    withTransaction: withTransactionMock,
}));

vi.mock('nitropack/runtime', () => ({
    useRuntimeConfig: runtimeConfigMock,
}));

import { createPostgresStorageAdapter } from '../../src/runtime/modules/persistence/server/postgres/postgresStorageAdapter';
import {
    BricksPageAddressConflictError,
    BricksRevisionConflictError,
} from '../../src/runtime/modules/persistence/server/utils/storageErrors';

/** Строка страницы, как её возвращает RETURNING. */
function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { id: 1, pagename: 'landing', revision: 2, ...overrides };
}

/**
 * Оборачивает мок в generic-сигнатуру транзакционного запроса: мок отдаёт
 * `unknown[]`, адаптер ждёт `Promise<T[]>`, и без обёртки присваивание пришлось
 * бы протаскивать двойным приведением, запрещённым в проекте.
 *
 * @param mock - Мок запроса внутри транзакции.
 * @returns Функция в сигнатуре withTransaction.
 */
function asTransactionQuery(
    mock: (text: string, params?: unknown[]) => Promise<unknown[]>
): TTransactionQuery {
    return <T>(text: string, params?: unknown[]): Promise<T[]> =>
        mock(text, params) as Promise<T[]>;
}

/** Ошибка pg с SQLSTATE unique_violation. */
function makeUniqueViolation(): Error & { code: string } {
    return Object.assign(new Error('duplicate key value violates unique constraint'), {
        code: '23505',
    });
}

describe('postgresStorageAdapter: конфликты и RETURNING-мутации страниц', () => {
    beforeEach(() => {
        queryMock.mockReset();
        queryOneMock.mockReset();
        withTransactionMock.mockReset();
        runtimeConfigMock.mockReset();
        runtimeConfigMock.mockReturnValue({ bricksVersionsLimit: 5 });
    });

    it('listPages: summary-проекция без schema, полная строка — только point-lookup', async () => {
        queryMock.mockResolvedValueOnce([makeRow()]);
        queryOneMock.mockResolvedValueOnce(makeRow());

        const adapter = createPostgresStorageAdapter();
        await adapter.listPages();
        await adapter.getPage(1);

        const [listSql] = queryMock.mock.calls[0] as [string];
        expect(listSql).not.toContain('schema');
        expect(listSql).toContain('revision');
        expect(listSql).toContain('thumbnail_url');

        const [getSql] = queryOneMock.mock.calls[0] as [string];
        expect(getSql).toContain('schema');
    });

    it('createPage: unique_violation → BricksPageAddressConflictError (гонка create)', async () => {
        queryOneMock.mockRejectedValueOnce(makeUniqueViolation());

        const adapter = createPostgresStorageAdapter();

        await expect(
            adapter.createPage({ pagename: 'landing', schema: { components: [] } })
        ).rejects.toBeInstanceOf(BricksPageAddressConflictError);
    });

    it('updatePage без schema: UPDATE с RETURNING, без pre-SELECT', async () => {
        queryMock.mockResolvedValueOnce([makeRow()]);

        const adapter = createPostgresStorageAdapter();
        const result = await adapter.updatePage(1, { title: 'New' });

        expect(result).toEqual(makeRow());
        expect(queryOneMock).not.toHaveBeenCalled();
        const [sql, values] = queryMock.mock.calls[0] as [string, unknown[]];
        expect(sql).toContain('revision = revision + 1');
        expect(sql).toContain('RETURNING');
        expect(values).toContain(1);
    });

    it('updatePage: несовпавший expectedRevision у существующей страницы → RevisionConflict', async () => {
        queryMock.mockResolvedValueOnce([]); // UPDATE не сматчил строку
        queryOneMock.mockResolvedValueOnce({ id: 1 }); // страница существует

        const adapter = createPostgresStorageAdapter();

        await expect(
            adapter.updatePage(1, { title: 'New', expectedRevision: 1 })
        ).rejects.toBeInstanceOf(BricksRevisionConflictError);

        const [sql, values] = queryMock.mock.calls[0] as [string, unknown[]];
        expect(sql).toContain('AND revision =');
        expect(values).toContain(1);
    });

    it('updatePage: 0 строк без страницы → null (404), с expectedRevision и без', async () => {
        queryMock.mockResolvedValue([]);
        queryOneMock.mockResolvedValue(null);

        const adapter = createPostgresStorageAdapter();

        await expect(adapter.updatePage(9, { title: 'x' })).resolves.toBeNull();
        await expect(
            adapter.updatePage(9, { title: 'x', expectedRevision: 4 })
        ).resolves.toBeNull();
    });

    it('updatePage: thumbnail-only PATCH не инкрементит revision', async () => {
        queryMock.mockResolvedValueOnce([makeRow()]);

        const adapter = createPostgresStorageAdapter();
        await adapter.updatePage(1, { thumbnailUrl: 'https://cdn.example.com/t.webp' });

        const [sql] = queryMock.mock.calls[0] as [string];
        expect(sql).not.toContain('revision = revision + 1');
    });

    it('updatePage со schema: конфликт внутри транзакции откатывает снапшот (throw)', async () => {
        const txQuery = vi.fn<(text: string, params?: unknown[]) => Promise<unknown[]>>();
        txQuery.mockResolvedValueOnce([{ id: 100 }]); // снапшот прошёл — страница есть
        txQuery.mockResolvedValueOnce([]); // UPDATE не сматчил precondition

        withTransactionMock.mockImplementation(
            async (fn: (tx: TTransactionQuery) => Promise<unknown>) =>
                fn(asTransactionQuery(txQuery))
        );

        const adapter = createPostgresStorageAdapter();

        await expect(
            adapter.updatePage(1, { schema: { components: [] }, expectedRevision: 1 })
        ).rejects.toBeInstanceOf(BricksRevisionConflictError);

        // prune после несматченного UPDATE не выполняется
        expect(txQuery).toHaveBeenCalledTimes(2);
    });

    it('updatePage со schema: снапшот уносит в версию thumbnail_url страницы', async () => {
        const txQuery = vi.fn<(text: string, params?: unknown[]) => Promise<unknown[]>>();
        txQuery.mockResolvedValueOnce([{ id: 100 }]); // снапшот
        txQuery.mockResolvedValueOnce([makeRow()]); // UPDATE
        txQuery.mockResolvedValueOnce([]); // prune

        withTransactionMock.mockImplementation(
            async (fn: (tx: TTransactionQuery) => Promise<unknown>) =>
                fn(asTransactionQuery(txQuery))
        );

        const adapter = createPostgresStorageAdapter();
        await adapter.updatePage(1, { schema: { components: [] } });

        // Кадр страницы на момент снапшота — это кадр сохраняемого состояния:
        // снимок канваса приезжает отдельным PATCH'ем уже после сохранения
        const [snapshotSql] = txQuery.mock.calls[0] as [string];
        expect(snapshotSql).toContain('thumbnail_url');
        expect(snapshotSql).toContain('INSERT INTO bricks_page_versions');
    });

    it('updatePage: занятый адрес → BricksPageAddressConflictError по любому полю пары', async () => {
        const adapter = createPostgresStorageAdapter();

        queryMock.mockRejectedValueOnce(makeUniqueViolation());
        await expect(adapter.updatePage(1, { pagename: 'taken' })).rejects.toBeInstanceOf(
            BricksPageAddressConflictError
        );

        // PATCH одного префикса собирает занятую пару так же, как переименование:
        // с проверкой только по `pagename` такой конфликт уходил наружу драйверной
        // ошибкой и превращался в 500 вместо 409
        queryMock.mockRejectedValueOnce(makeUniqueViolation());
        await expect(adapter.updatePage(1, { urlPrefix: 'blog' })).rejects.toBeInstanceOf(
            BricksPageAddressConflictError
        );
    });

    it('getPageByAddress: точные условия составного индекса, а не Filter по префиксу', async () => {
        const adapter = createPostgresStorageAdapter();

        queryOneMock.mockResolvedValueOnce(null);
        await adapter.getPageByAddress({ pagename: 'post', urlPrefix: null });

        // Отсутствие префикса — значение, а не «любой префикс»: `/post` не должен
        // находиться по адресу `/blog/post` и наоборот
        const [bareSql, bareParams] = queryOneMock.mock.calls[0] as [string, unknown[]];
        expect(bareSql).toContain('url_prefix IS NULL');
        expect(bareParams).toEqual(['post']);

        queryOneMock.mockResolvedValueOnce(null);
        await adapter.getPageByAddress({ pagename: 'post', urlPrefix: ' blog ' });

        // Равенство, а не `IS NOT DISTINCT FROM`: второе индексируется только по
        // ведущей колонке, и префикс уходит в Filter — на масштабе, который эта
        // фича и создаёт (один слаг под многими префиксами), это сотни лишних
        // buffer hits на каждый SSR-визит
        const [prefixedSql, prefixedParams] = queryOneMock.mock.calls[1] as [string, unknown[]];
        expect(prefixedSql).toContain('url_prefix = $2');
        expect(prefixedSql).not.toContain('IS NOT DISTINCT FROM');
        // Префикс нормализован: пробельное значение не создаёт второго адреса
        expect(prefixedParams).toEqual(['post', 'blog']);
    });

    it('deletePage/deleteMedia: DELETE ... RETURNING вместо SELECT-then-DELETE', async () => {
        queryMock.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([]);

        const adapter = createPostgresStorageAdapter();

        await expect(adapter.deletePage(1)).resolves.toBe(true);
        await expect(adapter.deleteMedia(9)).resolves.toBe(false);
        expect(queryMock.mock.calls[0][0]).toContain('RETURNING id');
        expect(queryOneMock).not.toHaveBeenCalled();
    });

    it('updateMedia: UPDATE с RETURNING, null — если запись не найдена', async () => {
        queryOneMock.mockResolvedValueOnce(null);

        const adapter = createPostgresStorageAdapter();

        await expect(adapter.updateMedia(5, { alt: 'x' })).resolves.toBeNull();
        expect(queryOneMock.mock.calls[0][0]).toContain('RETURNING');
    });
});

describe('postgresStorageAdapter: checkHealth (readiness)', () => {
    beforeEach(() => {
        queryMock.mockReset();
        runtimeConfigMock.mockReset();
    });

    it('без сконфигурированной БД (proxy-режим) проверка пропускается', async () => {
        runtimeConfigMock.mockReturnValue({ bricksVersionsLimit: 5 });

        const adapter = createPostgresStorageAdapter();

        await expect(adapter.checkHealth?.()).resolves.toBeUndefined();
        expect(queryMock).not.toHaveBeenCalled();
    });

    it('со сконфигурированной БД выполняет SELECT 1 и пробрасывает ошибку', async () => {
        runtimeConfigMock.mockReturnValue({
            bricksVersionsLimit: 5,
            bricksDatabaseUrl: 'postgres://localhost/bricks',
        });
        queryMock.mockResolvedValueOnce([]);

        const adapter = createPostgresStorageAdapter();

        await expect(adapter.checkHealth?.()).resolves.toBeUndefined();
        expect(queryMock).toHaveBeenCalledWith('SELECT 1');

        queryMock.mockRejectedValueOnce(new Error('connection refused'));
        await expect(adapter.checkHealth?.()).rejects.toThrow('connection refused');
    });
});
