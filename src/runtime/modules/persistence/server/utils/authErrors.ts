/**
 * Доменные ошибки auth-слоя (учётки database-auth).
 *
 * Отдельно от `storageErrors.ts`: там ошибки страниц и медиа — контракт
 * `IStorageAdapter`, который может жить во внешнем backend'е; здесь — контракт
 * `IAuthAdapter`, у которого свои реализации и свои краевые правила.
 * Ручки маппят эти классы на HTTP-статусы с машиночитаемым `data.code`
 * (`toUsersHttpError` в handlerHelpers, коды — `BRICKS_API_ERROR_CODES`).
 */

/**
 * Мутация оставила бы систему без активного администратора.
 *
 * Отказ ОПРЕДЕЛЯЕТСЯ внутри транзакции адаптера, где набор активных админов уже
 * заблокирован (`FOR UPDATE`): без блокировки два одновременных понижения читали
 * бы одно и то же «админов двое» и оба проходили бы — write skew, который READ
 * COMMITTED не ловит. Проверять это в ручке, до вызова адаптера, поэтому нельзя.
 *
 * А вот сама ошибка СОЗДАЁТСЯ уже после выхода из транзакции (изнутри отказ
 * возвращается флагом): `withTransaction` логирует любую пойманную ошибку как
 * сбой транзакции, и штатный отказ уезжал бы в лог сбоем базы. Перенос `throw`
 * внутрь колбэка вернёт эти ложные записи.
 */
export class BricksLastActiveAdminError extends Error {
    constructor() {
        super('Cannot leave the system without an active administrator');
        this.name = 'BricksLastActiveAdminError';
    }
}

/**
 * Логин занят. Сравнение регистронезависимое — как и вход, поэтому `Admin` при
 * существующем `admin` конфликтует. Кидается по нарушению уникального индекса
 * `lower(username)`, а не по предварительной проверке: между чтением и вставкой
 * успевает вклиниться параллельное создание.
 */
export class BricksUsernameTakenError extends Error {
    readonly username: string;

    constructor(username: string, cause?: unknown) {
        super('User with this username already exists', { cause });
        this.name = 'BricksUsernameTakenError';
        this.username = username;
    }
}
