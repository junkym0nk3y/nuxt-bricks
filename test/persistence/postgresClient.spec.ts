// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// #endregion

const {
    poolConstructorMock,
    poolQueryMock,
    poolOnMock,
    poolConnectMock,
    clientQueryMock,
    releaseMock,
    runtimeConfigMock,
} = vi.hoisted(() => ({
    poolConstructorMock: vi.fn(),
    poolQueryMock: vi.fn(),
    poolOnMock: vi.fn(),
    poolConnectMock: vi.fn(),
    clientQueryMock: vi.fn(),
    releaseMock: vi.fn(),
    runtimeConfigMock: vi.fn(),
}));

// Методы навешиваются в конструкторе, а не полями класса: инициализатор поля
// внутри фабрики мока ломает подъём — транспиляция ссылается на биндинг импорта
// раньше, чем тот инициализирован, и файл не загружается вовсе
vi.mock('pg', () => ({
    Pool: class {
        constructor(config: unknown) {
            poolConstructorMock(config);
            Object.assign(this, {
                query: poolQueryMock,
                on: poolOnMock,
                connect: poolConnectMock,
            });
        }
    },
}));

vi.mock('nitropack/runtime', () => ({
    useRuntimeConfig: runtimeConfigMock,
}));

// Модуль под тестом импортируется ПОСЛЕ моков: фабрики поднимаются выше
// импортов, и обращение к биндингу импорта до его инициализации роняет файл
import {
    query,
    withTransaction,
} from '../../src/runtime/modules/persistence/server/postgres/client';
import { BricksStatementTimeoutError } from '../../src/runtime/modules/persistence/server/utils/storageErrors';

/** Ошибка драйвера с SQLSTATE query_canceled — так выглядит срабатывание лимита. */
function makeCancelledError(): Error & { code: string } {
    return Object.assign(new Error('canceling statement due to statement timeout'), {
        code: '57014',
    });
}

describe('клиент PostgreSQL: серверный лимит и отмена запроса', () => {
    beforeEach(() => {
        // Счётчик конструктора НЕ сбрасывается: пул в модуле — singleton, он
        // создаётся один раз на весь файл, и кейс о конфигурации не должен
        // зависеть от порядка запуска
        poolQueryMock.mockReset();
        clientQueryMock.mockReset();
        releaseMock.mockReset();
        poolConnectMock.mockReset();
        poolConnectMock.mockResolvedValue({ query: clientQueryMock, release: releaseMock });
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        runtimeConfigMock.mockReturnValue({
            bricksDatabaseUrl: 'postgresql://localhost:5432/bricks',
            bricksDatabaseStatementTimeoutMs: '4500',
        });
    });

    it('лимит из конфигурации доезжает до конструктора пула', async () => {
        poolQueryMock.mockResolvedValue({ rows: [] });

        await query('SELECT 1');

        expect(poolConstructorMock).toHaveBeenCalledTimes(1);
        expect(poolConstructorMock).toHaveBeenCalledWith(
            expect.objectContaining({
                connectionString: 'postgresql://localhost:5432/bricks',
                statement_timeout: 4500,
            })
        );
    });

    it('лимит ставится и в самой сессии — startup-параметр перекрываем строкой подключения', async () => {
        poolQueryMock.mockResolvedValue({ rows: [] });

        await query('SELECT 1');

        // Хук выдачи соединения: `pg-pool` дожидается его перед тем, как отдать
        // клиента, поэтому первый запрос не может обогнать установку лимита
        const { onConnect } = poolConstructorMock.mock.calls[0][0];
        const connectedClient = { query: clientQueryMock };
        clientQueryMock.mockResolvedValue({ rows: [] });

        await onConnect(connectedClient);

        // Значение уходит параметром, а не интерполяцией в текст SET
        expect(clientQueryMock).toHaveBeenCalledWith('SELECT set_config($1, $2, false)', [
            'statement_timeout',
            '4500',
        ]);
    });

    it('отменённый базой запрос становится доменной ошибкой с сохранённой причиной', async () => {
        const cancelled = makeCancelledError();
        poolQueryMock.mockRejectedValue(cancelled);

        // Без перевода в доменную ошибку ручка отдала бы generic 500: причина
        // отказа известна, а пользователь видел бы внутреннюю поломку
        await expect(query('SELECT pg_sleep(30)')).rejects.toBeInstanceOf(
            BricksStatementTimeoutError
        );
        await expect(query('SELECT pg_sleep(30)')).rejects.toMatchObject({ cause: cancelled });
    });

    it('зависшая установка лимита не держит ожидающего дольше потолка соединения', async () => {
        vi.useFakeTimers();
        poolQueryMock.mockResolvedValue({ rows: [] });

        await query('SELECT 1');

        const { onConnect } = poolConstructorMock.mock.calls[0][0];
        // Потолок получения соединения сюда не достаёт: пул снимает свой таймер
        // сразу после подключения и только потом ждёт хук
        clientQueryMock.mockReturnValue(
            new Promise(() => {
                // Ответа не будет: имитируем сессию, которая не отвечает и не рвётся
            })
        );

        const applying = onConnect({ query: clientQueryMock });
        const assertion = expect(applying).rejects.toThrow(/Timed out while applying/);

        await vi.advanceTimersByTimeAsync(2_100);
        await assertion;

        vi.useRealTimers();
    });

    it('отказ выдачи соединения доходит до транзакции тем же классом ошибки', async () => {
        // Отказ хука приходит из connect(), то есть до первого BEGIN: без
        // обработки на этом месте транзакционный путь отдавал бы generic 500
        // там, где обычный запрос отдаёт честный код
        poolConnectMock.mockRejectedValueOnce(makeCancelledError());

        await expect(withTransaction(() => Promise.resolve([]))).rejects.toBeInstanceOf(
            BricksStatementTimeoutError
        );
    });

    it('прочие ошибки драйвера остаются собой — их разбирают вызывающие', async () => {
        const uniqueViolation = Object.assign(new Error('duplicate key value'), { code: '23505' });
        poolQueryMock.mockRejectedValue(uniqueViolation);

        // Обёртка на всё сломала бы распознавание конфликта pagename в адаптере
        await expect(query('INSERT INTO bricks_pages …')).rejects.toBe(uniqueViolation);
    });

    it('отмена внутри транзакции откатывает её и отпускает соединение', async () => {
        const cancelled = makeCancelledError();
        clientQueryMock.mockImplementation((sql: string) => {
            if (sql.includes('pg_sleep')) {
                return Promise.reject(cancelled);
            }

            return Promise.resolve({ rows: [] });
        });

        await expect(
            withTransaction((txQuery) => txQuery('SELECT pg_sleep(30)'))
        ).rejects.toBeInstanceOf(BricksStatementTimeoutError);

        expect(clientQueryMock).toHaveBeenCalledWith('ROLLBACK');
        expect(releaseMock).toHaveBeenCalledTimes(1);
    });
});

describe('клиент PostgreSQL: запрос, который не был отправлен', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    it('несконфигурированная база даёт отказ отдельного класса, а не обычную ошибку', async () => {
        // Пул в модуле — singleton, поэтому кейс требует свежего графа модулей:
        // иначе уже собранный пул из соседних тестов не даст дойти до отказа.
        // Класс ошибки берётся оттуда же — сравнение с классом из другого
        // экземпляра модуля не сработало бы
        vi.resetModules();
        runtimeConfigMock.mockReturnValue({});

        const [{ query: freshQuery }, { BricksPostgresQueryNotStartedError }] = await Promise.all([
            import('../../src/runtime/modules/persistence/server/postgres/client'),
            import('../../src/runtime/modules/persistence/server/utils/storageErrors'),
        ]);

        const thrown = await freshQuery('SELECT 1').catch((error: unknown) => error);

        expect(thrown).toBeInstanceOf(BricksPostgresQueryNotStartedError);
        // Причина сохранена: без неё в логе не осталось бы подсказки про
        // NUXT_BRICKS_DATABASE_URL
        expect((thrown as Error).cause).toMatchObject({
            message: expect.stringContaining('Database connection is not configured'),
        });
    });
});
