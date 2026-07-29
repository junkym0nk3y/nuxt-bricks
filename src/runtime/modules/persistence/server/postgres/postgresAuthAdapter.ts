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

/** Строка JOIN-результата сессии с полями пользователя (алиасы camelCase). */
interface ISessionJoinRow {
    tokenHash: string;
    // TIMESTAMPTZ-колонка: node-postgres возвращает Date.
    expiresAt: string | Date;
    lastUsedAt: string;
    userId: number;
    username: string;
    isActive: boolean;
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
         */
        async getUserByUsername(username: string): Promise<IAuthUserRecord | null> {
            return queryOne<IAuthUserRecord>(
                `SELECT id, username, password_hash AS "passwordHash", is_active AS "isActive"
                FROM bricks_users
                WHERE username = $1`,
                [username]
            );
        },

        /**
         * Возвращает непросроченную сессию вместе с пользователем или null.
         * Просроченная сессия неотличима от отсутствующей (SQL-фильтр по expires_at).
         */
        async getSessionWithUser(tokenHash: string): Promise<IAuthSessionWithUser | null> {
            const row = await queryOne<ISessionJoinRow>(
                `SELECT s.token_hash AS "tokenHash",
                    s.expires_at AS "expiresAt",
                    s.last_used_at AS "lastUsedAt",
                    u.id AS "userId",
                    u.username,
                    u.is_active AS "isActive"
                FROM bricks_sessions s
                JOIN bricks_users u ON u.id = s.user_id
                WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
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
                },
            };
        },

        /**
         * Создаёт сессию (в БД — только SHA-256 hex токена).
         */
        async createSession(payload: ICreateAuthSessionPayload): Promise<void> {
            await query(
                `INSERT INTO bricks_sessions (token_hash, user_id, expires_at)
                VALUES ($1, $2, $3)`,
                [payload.tokenHash, payload.userId, payload.expiresAt]
            );
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
