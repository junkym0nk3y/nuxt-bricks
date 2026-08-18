/**
 * Дефолтный IAuthAdapter поверх PostgreSQL (таблицы bricks_users / bricks_sessions).
 * Схема таблиц — versioned-миграции migrations/*.sql (CLI bricks-migrate);
 * runtime-DDL адаптер не выполняет.
 *
 * Здесь — чтение учётки для входа и жизненный цикл cookie-сессий. Мутации самой
 * строки учётки (роль, активность, пароли, профиль, удаление) живут в
 * `postgresAuthUserMethods.ts` и подмешиваются спредом: у них свои краевые
 * правила и блокировки, и вместе файл перерастал потолок в 500 строк.
 */
import { query, queryOne } from './client';
import { createPostgresAuthUserMethods } from './postgresAuthUserMethods';
import type {
    IAuthAdapter,
    IAuthUserRecord,
    IAuthSessionWithUser,
    ICreateAuthSessionPayload,
} from '../../types/authAdapters';
import type { IAuthSessionJoinRow } from '../../types/postgres';

/**
 * Создаёт Postgres-реализацию IAuthAdapter.
 *
 * @returns Адаптер пользователей и cookie-сессий.
 */
export function createPostgresAuthAdapter(): IAuthAdapter {
    return {
        /**
         * Возвращает пользователя по username (включая хеш пароля) или null.
         * Поиск регистронезависимый — под уникальным индексом по lower(username);
         * регистрозависимый поиск разошёлся бы с rate limiter'ом логина, который
         * считает `Admin` и `admin` одним ключом попыток.
         */
        async getUserByUsername(username: string): Promise<IAuthUserRecord | null> {
            return queryOne<IAuthUserRecord>(
                `SELECT id, username, password_hash AS "passwordHash", is_active AS "isActive",
                    role, auth_version AS "authVersion"
                FROM bricks_users
                WHERE lower(username) = lower($1)`,
                [username]
            );
        },

        /**
         * Возвращает непросроченную сессию вместе с пользователем или null.
         * Просроченная сессия неотличима от отсутствующей (SQL-фильтр по expires_at).
         *
         * Сверка `s.auth_version = u.auth_version` — носитель отзыва прав:
         * смена пароля, деактивация и смена роли поднимают поколение учётки, и
         * все прежние сессии перестают совпадать тем же запросом, которым их
         * читают. Полагаться вместо этого на удаление строк сессий нельзя:
         * отдельный DELETE может отказать уже после успешной смены пароля.
         */
        async getSessionWithUser(tokenHash: string): Promise<IAuthSessionWithUser | null> {
            const row = await queryOne<IAuthSessionJoinRow>(
                `SELECT s.token_hash AS "tokenHash",
                    s.expires_at AS "expiresAt",
                    s.last_used_at AS "lastUsedAt",
                    u.id AS "userId",
                    u.username,
                    u.is_active AS "isActive",
                    u.role,
                    u.auth_version AS "authVersion",
                    u.display_name AS "displayName",
                    u.avatar_url AS "avatarUrl"
                FROM bricks_sessions s
                JOIN bricks_users u ON u.id = s.user_id
                WHERE s.token_hash = $1
                    AND s.expires_at > NOW()
                    AND s.auth_version = u.auth_version`,
                [tokenHash]
            );

            if (!row) {
                return null;
            }

            return {
                tokenHash: row.tokenHash,
                // TIMESTAMPTZ-колонка: node-postgres возвращает Date —
                // нормализуем до ISO-строки, контракт IAuthSessionWithUser.expiresAt
                // остаётся string (ISO 8601 UTC).
                expiresAt:
                    row.expiresAt instanceof Date ? row.expiresAt.toISOString() : row.expiresAt,
                lastUsedAt: row.lastUsedAt,
                user: {
                    id: row.userId,
                    username: row.username,
                    isActive: row.isActive,
                    role: row.role,
                    authVersion: row.authVersion,
                    displayName: row.displayName,
                    avatarUrl: row.avatarUrl,
                },
            };
        },

        /**
         * Создаёт сессию (в БД — только SHA-256 hex токена), если учётка всё ещё
         * активна и её поколение совпадает с прочитанным до проверки пароля, и
         * тем же запросом отмечает момент входа.
         *
         * Вставка условная, а не безусловная: проверка пароля идёт под scrypt
         * секунды, и параллельная смена пароля или деактивация могли завершиться
         * раньше вставки — тогда безусловный INSERT выдал бы рабочую сессию по
         * уже отозванным креденшелам.
         *
         * Отметка входа живёт в CTE того же запроса, а не отдельным UPDATE, и
         * условие у неё то же самое. Порядок здесь и есть смысл конструкции:
         * запись даты ДО условной вставки отметила бы вход, которого не
         * случилось (учётку успели деактивировать), а отдельный запрос ПОСЛЕ
         * коммита сессии мог бы потеряться, оставив вошедшего без даты. Одним
         * оператором обе записи применяются вместе либо не применяются вовсе.
         * `auth_version` при этом не двигается: вход — не отзыв прав, и
         * инкремент погасил бы только что созданную сессию.
         *
         * @returns false — состояние учётки изменилось, куку выставлять нельзя.
         */
        async createSession(payload: ICreateAuthSessionPayload): Promise<boolean> {
            const rows = await query<{ id: number }>(
                `WITH authenticated AS (
                    UPDATE bricks_users
                    SET last_login_at = NOW()
                    WHERE id = $2
                        AND is_active = TRUE
                        AND auth_version = $4
                    RETURNING id, auth_version
                )
                INSERT INTO bricks_sessions (token_hash, user_id, auth_version, expires_at)
                SELECT $1, a.id, a.auth_version, $3
                FROM authenticated a
                RETURNING id`,
                [payload.tokenHash, payload.userId, payload.expiresAt, payload.expectedAuthVersion]
            );

            return rows.length > 0;
        },

        /**
         * Удаляет сессию по хешу токена (logout / отзыв).
         */
        async deleteSession(tokenHash: string): Promise<void> {
            await query('DELETE FROM bricks_sessions WHERE token_hash = $1', [tokenHash]);
        },

        /**
         * Удаляет просроченные сессии; возвращает количество удалённых.
         */
        async deleteExpiredSessions(): Promise<number> {
            const rows = await query<{ id: number }>(
                'DELETE FROM bricks_sessions WHERE expires_at <= NOW() RETURNING id'
            );

            return rows.length;
        },

        /**
         * Sliding-продление: обновляет expires_at и last_used_at сессии.
         */
        async touchSession(tokenHash: string, expiresAt: Date): Promise<void> {
            await query(
                `UPDATE bricks_sessions
                SET expires_at = $2, last_used_at = NOW()
                WHERE token_hash = $1`,
                [tokenHash, expiresAt]
            );
        },

        ...createPostgresAuthUserMethods(),
    };
}
