// #region Imports
// Vitest
import { afterEach, describe, expect, it, vi } from 'vitest';

// Utils
import {
    buildPostgresPoolConfig,
    resolveStatementTimeoutMs,
} from '../../src/runtime/modules/persistence/server/postgres/poolConfig';
// #endregion

/** Дефолт лимита: ниже клиентского потолка чтения на принятый в проекте запас. */
const DEFAULT_STATEMENT_TIMEOUT_MS = 8_000;

describe('конфигурация пула PostgreSQL: серверный лимит statement', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('незаданное значение даёт дефолт, а число и строка из env — сами себя', () => {
        expect(resolveStatementTimeoutMs(undefined)).toBe(DEFAULT_STATEMENT_TIMEOUT_MS);
        expect(resolveStatementTimeoutMs(null)).toBe(DEFAULT_STATEMENT_TIMEOUT_MS);
        expect(resolveStatementTimeoutMs('')).toBe(DEFAULT_STATEMENT_TIMEOUT_MS);
        expect(resolveStatementTimeoutMs(120_000)).toBe(120_000);
        expect(resolveStatementTimeoutMs('120000')).toBe(120_000);
        expect(resolveStatementTimeoutMs(1500.7)).toBe(1500);
    });

    it('нуль и прочие невалидные значения не отключают лимит, а заменяются дефолтом', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        // Опт-аут был бы тихим возвратом дефекта: зависший запрос держит
        // соединение из пула до конца жизни процесса. `true` в списке не для
        // полноты: Nitro разбирает строку «true» из env в boolean, а через
        // Number() он стал бы лимитом в 1 мс, при котором не проходит ничего
        const invalidValues = [0, '0', false, true, -1, Number.NaN, 'later', 2_147_483_648, {}, []];

        for (const raw of invalidValues) {
            expect(resolveStatementTimeoutMs(raw)).toBe(DEFAULT_STATEMENT_TIMEOUT_MS);
        }

        // Отброшенное значение не должно выглядеть как принятая настройка
        expect(warn).toHaveBeenCalledTimes(invalidValues.length);
    });

    it('валидное значение принимается молча', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        resolveStatementTimeoutMs('9000');

        expect(warn).not.toHaveBeenCalled();
    });

    it('лимит уезжает startup-параметром соединения, а не клиентским таймером', () => {
        const config = buildPostgresPoolConfig('postgresql://localhost:5432/bricks', 5_000);

        // query_timeout — клиентский таймер: запрос продолжил бы исполняться в
        // базе и держать соединение, то есть ровно то, от чего лимит и нужен
        expect(config).toEqual({
            connectionString: 'postgresql://localhost:5432/bricks',
            max: 20,
            idleTimeoutMillis: 30_000,
            connectionTimeoutMillis: 2_000,
            statement_timeout: 5_000,
        });
    });

    it('строка подключения не переписывается — её грамматика принадлежит драйверу', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        // Драйвер умеет то, чего не умеет `new URL` (например, восстанавливает
        // разбор URL без хоста), поэтому пересборка строки исказила бы
        // подключение. Лимит от значения в строке защищает не правка строки, а
        // сессионный SET при выдаче соединения
        const withParam = 'postgresql://localhost:5432/bricks?sslmode=require&statement_timeout=0';
        const plain = 'postgresql://user:p%40ss@localhost:5432/bricks?sslmode=require';

        expect(buildPostgresPoolConfig(withParam, 5_000).connectionString).toBe(withParam);
        expect(buildPostgresPoolConfig(plain, 5_000).connectionString).toBe(plain);
    });

    it('предупреждение о параметре в строке ловит и закодированное имя, и форму без хоста', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        // `%5F` драйвер декодирует в `_`, то есть проверка по сырой подстроке
        // такой параметр пропускала бы; строку без хоста `new URL` не разбирает,
        // а драйвер разбирает — там остаётся поиск подстроки
        buildPostgresPoolConfig('postgresql://localhost:5432/bricks?statement_timeout=0', 5_000);
        buildPostgresPoolConfig('postgresql://localhost:5432/bricks?statement%5Ftimeout=0', 5_000);
        buildPostgresPoolConfig('postgresql://postgres@/bricks?statement_timeout=0', 5_000);

        expect(warn).toHaveBeenCalledTimes(3);

        warn.mockClear();
        buildPostgresPoolConfig('postgresql://localhost:5432/bricks?sslmode=require', 5_000);

        expect(warn).not.toHaveBeenCalled();
    });
});
