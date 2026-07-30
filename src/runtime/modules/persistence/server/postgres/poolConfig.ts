/**
 * Конфигурация пула PostgreSQL: размеры и серверные лимиты.
 *
 * Вынесено из `client.ts` отдельным модулем без импорта `pg`: значение лимита
 * приходит из конфигурации (то есть строкой из ENV) и его резолв нужно
 * проверять юнитами, а `pg` — optional peer-зависимость.
 */

// #region Imports
// Types
import type { IPostgresPoolConfig } from '../../types/postgres';
// #endregion

// #region Constants
/**
 * Серверный потолок исполнения одного statement по умолчанию.
 *
 * Зачем он нужен: клиентский потолок ожидания освобождает ожидающего
 * (посетителя SSR, флаг операции в билдере), но не ресурс — отменённый на
 * клиенте запрос продолжает занимать соединение из пула. Пул конечен, поэтому
 * серия таких запросов исчерпала бы его, и лечение UX превратилось бы в отказ
 * обслуживания. Отменить запрос может только сам PostgreSQL.
 *
 * Почему восемь секунд: у чтения клиентский потолок 10 с, и лимит поставлен ниже
 * на принятый в проекте запас (2 с) — чтобы в типичном случае пользователь
 * получал внятный отказ сервера, а не собственный обрыв.
 *
 * Порядка «сервер ответит раньше клиента» это НЕ гарантирует, и строить на нём
 * логику нельзя: лимит ограничивает каждый statement по отдельности, а не запрос
 * целиком. Один HTTP-запрос выполняет их несколько (проверка сессии
 * database-auth, затем BEGIN, снапшот, запись, очистка истории, COMMIT), и до
 * двух секунд может уйти на получение соединения из пула
 * (`connectionTimeoutMillis`) — серверный таймер стартует только после. Цель
 * лимита — освободить соединение; бюджет всей операции живёт на стороне клиента.
 */
const DEFAULT_STATEMENT_TIMEOUT_MS = 8_000;

/** Верхняя граница `statement_timeout` в PostgreSQL: значение хранится как int32 мс. */
const MAX_STATEMENT_TIMEOUT_MS = 2_147_483_647;

/** Максимум соединений в пуле. */
const POOL_MAX_CONNECTIONS = 20;

/** Сколько держать простаивающее соединение перед закрытием, мс. */
const POOL_IDLE_TIMEOUT_MS = 30_000;

/** Потолок ожидания свободного соединения из пула, мс. */
const POOL_CONNECTION_TIMEOUT_MS = 2_000;

/**
 * Потолок установки лимита в новой сессии (`client.ts`).
 *
 * Величина та же, что у получения соединения, но бюджет отдельный и
 * последовательный: пул снимает свой таймер до вызова хука, поэтому получение
 * пригодного клиента в худшем случае занимает сумму двух потолков, а не один.
 * Держать его коротким можно: к моменту хука соединение уже установлено, а
 * `set_config` — дешёвая локальная команда; медленный старт БД проявляется
 * раньше, на фазе подключения.
 */
export const STATEMENT_TIMEOUT_APPLY_TIMEOUT_MS = POOL_CONNECTION_TIMEOUT_MS;
// #endregion

// #region Methods
/**
 * Резолвит серверный лимит statement из конфигурации (ENV-значения приходят
 * строками). Дробное значение округляется вниз.
 *
 * Опт-аута нет намеренно: `0` и `false` — не «без лимита», а тихий возврат
 * исходного дефекта, при котором зависший запрос держит соединение до конца
 * жизни процесса. Законно долгий запрос обслуживается большим конечным
 * значением, а не снятием лимита.
 *
 * @param raw - Значение из runtimeConfig (число, строка или ничего).
 * @returns Лимит в миллисекундах.
 */
export function resolveStatementTimeoutMs(raw: unknown): number {
    if (raw === undefined || raw === null || raw === '') {
        return DEFAULT_STATEMENT_TIMEOUT_MS;
    }

    // Тип проверяется до Number(): `true` иначе стал бы лимитом в 1 мс, при
    // котором не проходит ни один запрос. Значение приходит и через Nitro-env,
    // где строка «true» разбирается в boolean, — то есть опечатка в переменной
    // окружения останавливала бы работу с БД вместо дефолта с предупреждением
    const parsed =
        typeof raw === 'number' || typeof raw === 'string' ? Math.floor(Number(raw)) : Number.NaN;

    if (!Number.isFinite(parsed) || parsed < 1 || parsed > MAX_STATEMENT_TIMEOUT_MS) {
        // Молча подставленный дефолт выглядел бы как принятая настройка: попытка
        // выключить лимит нулём казалась бы удавшейся
        console.warn(
            `[PostgreSQL] Ignoring statement timeout value "${String(raw)}": expected an integer ` +
                `between 1 and ${MAX_STATEMENT_TIMEOUT_MS} ms. ` +
                `Falling back to ${DEFAULT_STATEMENT_TIMEOUT_MS} ms.`
        );

        return DEFAULT_STATEMENT_TIMEOUT_MS;
    }

    return parsed;
}

/**
 * Есть ли в строке подключения свой `statement_timeout`.
 *
 * Драйвер накладывает разобранный URL ПОВЕРХ объекта конфигурации
 * (`Object.assign({}, config, parse(connectionString))`), а туда попадают все
 * query-параметры без фильтра, поэтому `?statement_timeout=0` в строке снимал
 * бы лимит целиком (замерено: запрос не отменяется, `SHOW statement_timeout`
 * возвращает 0). Фактическую защиту от этого даёт не проверка строки, а
 * сессионный `SET` при выдаче соединения (см. `client.ts`) — он выполняется
 * после старта сессии и перекрывает любое startup-значение.
 *
 * Проверка здесь нужна только для предупреждения и потому best-effort: разбор
 * идёт как URL (так `%5F` в имени параметра декодируется и тоже попадается), а
 * для строк другой грамматики (`host=… port=…`) остаётся поиск подстроки.
 * Строка при этом НЕ переписывается: у драйвера своя грамматика — он умеет,
 * например, восстанавливать разбор URL без хоста, — и любая наша правка
 * рисковала бы исказить подключение, ничего не давая сверх `SET`.
 *
 * Вектор через `options=-c statement_timeout=…` проверен отдельно и обработки
 * не требует: отдельный startup-параметр применяется после command-line options.
 *
 * @param connectionString - Строка подключения из конфигурации.
 * @returns Строка задаёт собственный лимит.
 */
function hasStatementTimeoutParam(connectionString: string): boolean {
    const PARAM_NAME = 'statement_timeout';

    try {
        return new URL(connectionString).searchParams.has(PARAM_NAME);
    } catch {
        return connectionString.includes(PARAM_NAME);
    }
}

/**
 * Собирает конфигурацию пула.
 *
 * `statement_timeout` уезжает startup-параметром соединения, то есть действует
 * на каждый запрос любого потребителя пула (storage-адаптер и database-auth).
 * Альтернативы отклонены: `query_timeout` драйвера — клиентский таймер, при
 * котором серверный запрос продолжает исполняться (замерено), а `SET` в
 * обработчике `pool.on('connect')` ненадёжен — `pg-pool` не ждёт промис
 * слушателя, поэтому первый запрос способен обогнать установку лимита.
 *
 * Соседние серверные лимиты не задаются осознанно: ожидание блокировки уже
 * входит в бюджет statement, а `idle_in_transaction_session_timeout` не отменяет
 * запрос, а рвёт сессию — и приходит асинхронным событием `error` на ВЫДАННОМ
 * клиенте, где слушателя пула нет (`pool.on('error')` обслуживает только
 * простаивающие соединения), то есть уронил бы процесс.
 *
 * @param connectionString - Строка подключения PostgreSQL.
 * @param statementTimeoutRaw - Значение лимита из runtimeConfig.
 * @returns Конфигурация для конструктора пула.
 */
export function buildPostgresPoolConfig(
    connectionString: string,
    statementTimeoutRaw: unknown
): IPostgresPoolConfig {
    const statementTimeout = resolveStatementTimeoutMs(statementTimeoutRaw);

    if (hasStatementTimeoutParam(connectionString)) {
        console.warn(
            '[PostgreSQL] Remove "statement_timeout" from the connection string: the limit is ' +
                'owned by bricks.database.statementTimeoutMs ' +
                `(NUXT_BRICKS_DATABASE_STATEMENT_TIMEOUT_MS), effective value is ${statementTimeout} ms. ` +
                'The value from the string still applies until the connection is initialised, ' +
                'so a tiny one can cancel that initialisation and an invalid one can break the connection.'
        );
    }

    return {
        connectionString,
        max: POOL_MAX_CONNECTIONS,
        idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS,
        connectionTimeoutMillis: POOL_CONNECTION_TIMEOUT_MS,
        statement_timeout: statementTimeout,
    };
}
// #endregion
