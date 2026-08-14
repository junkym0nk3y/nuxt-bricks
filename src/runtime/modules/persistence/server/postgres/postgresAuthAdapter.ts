/**
 * Дефолтный IAuthAdapter поверх PostgreSQL (таблицы bricks_users / bricks_sessions).
 * Схема таблиц — versioned-миграции migrations/*.sql (CLI bricks-migrate);
 * runtime-DDL адаптер не выполняет.
 */
import { query, queryOne } from './client';
import type {
    IAuthAdapter,
    IAuthUserRecord,
    IAuthSessionWithUser,
    ICreateAuthSessionPayload,
} from '../../types/adapters';
import type { TBricksUserRole } from '../../../common/types/auth';

/** Строка JOIN-результата сессии с полями пользователя (алиасы camelCase). */
interface ISessionJoinRow {
    tokenHash: string;
    // TIMESTAMPTZ-колонка: node-postgres возвращает Date.
    expiresAt: string | Date;
    lastUsedAt: string;
    userId: number;
    username: string;
    isActive: boolean;
    role: TBricksUserRole;
    displayName: string | null;
    avatarUrl: string | null;
}

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
            const row = await queryOne<ISessionJoinRow>(
                `SELECT s.token_hash AS "tokenHash",
                    s.expires_at AS "expiresAt",
                    s.last_used_at AS "lastUsedAt",
                    u.id AS "userId",
                    u.username,
                    u.is_active AS "isActive",
                    u.role,
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
                    displayName: row.displayName,
                    avatarUrl: row.avatarUrl,
                },
            };
        },

        /**
         * Создаёт сессию (в БД — только SHA-256 hex токена), если учётка всё ещё
         * активна и её поколение совпадает с прочитанным до проверки пароля.
         *
         * Вставка условная (INSERT ... SELECT), а не безусловная: проверка
         * пароля идёт под scrypt секунды, и параллельная смена пароля или
         * деактивация могли завершиться раньше вставки — тогда безусловный
         * INSERT выдал бы рабочую сессию по уже отозванным креденшелам.
         *
         * @returns false — состояние учётки изменилось, куку выставлять нельзя.
         */
        async createSession(payload: ICreateAuthSessionPayload): Promise<boolean> {
            const rows = await query<{ id: number }>(
                `INSERT INTO bricks_sessions (token_hash, user_id, auth_version, expires_at)
                SELECT $1, u.id, u.auth_version, $3
                FROM bricks_users u
                WHERE u.id = $2
                    AND u.is_active = TRUE
                    AND u.auth_version = $4
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
    };
}
