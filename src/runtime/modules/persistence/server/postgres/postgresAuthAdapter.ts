/**
 * Дефолтный IAuthAdapter поверх PostgreSQL (таблицы bricks_users / bricks_sessions).
 * Схема таблиц — database/init.sql в корне репозитория; в рантайме её гарантирует
 * мемоизированный ensureSchema() (миграций в проекте нет, init.sql в npm-пакет
 * не попадает — files: ["dist"]).
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
    expiresAt: string;
    lastUsedAt: string;
    userId: number;
    username: string;
    isActive: boolean;
}

/** DDL auth-таблиц — идемпотентный, зеркалит database/init.sql. */
const AUTH_SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS bricks_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_bricks_users_updated_at ON bricks_users;
CREATE TRIGGER update_bricks_users_updated_at
    BEFORE UPDATE ON bricks_users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS bricks_sessions (
    id SERIAL PRIMARY KEY,
    token_hash CHAR(64) UNIQUE NOT NULL,
    user_id INTEGER NOT NULL REFERENCES bricks_users(id) ON DELETE CASCADE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    last_used_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bricks_sessions_user_id ON bricks_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_bricks_sessions_expires_at ON bricks_sessions(expires_at);
`;

/**
 * Создаёт Postgres-реализацию IAuthAdapter.
 *
 * @returns Адаптер пользователей и cookie-сессий.
 */
export function createPostgresAuthAdapter(): IAuthAdapter {
    // Мемоизация с reset-on-failure: сбой БД не должен «отравить» синглтон —
    // следующий запрос попробует создать схему заново.
    let schemaPromise: Promise<void> | null = null;

    /**
     * Идемпотентно гарантирует наличие auth-таблиц при первом обращении.
     */
    function ensureSchema(): Promise<void> {
        if (!schemaPromise) {
            schemaPromise = query(AUTH_SCHEMA_DDL).then(
                () => undefined,
                (error: unknown) => {
                    schemaPromise = null;
                    throw error;
                }
            );
        }

        return schemaPromise;
    }

    return {
        /**
         * Возвращает пользователя по username (включая хеш пароля) или null.
         */
        async getUserByUsername(username: string): Promise<IAuthUserRecord | null> {
            await ensureSchema();

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
            await ensureSchema();

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
                expiresAt: row.expiresAt,
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
            await ensureSchema();

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
            await ensureSchema();

            await query('DELETE FROM bricks_sessions WHERE token_hash = $1', [tokenHash]);
        },

        /**
         * Удаляет просроченные сессии; возвращает количество удалённых.
         */
        async deleteExpiredSessions(): Promise<number> {
            await ensureSchema();

            const rows = await query<{ id: number }>(
                'DELETE FROM bricks_sessions WHERE expires_at <= NOW() RETURNING id'
            );

            return rows.length;
        },

        /**
         * Sliding-продление: обновляет expires_at и last_used_at сессии.
         */
        async touchSession(tokenHash: string, expiresAt: Date): Promise<void> {
            await ensureSchema();

            await query(
                `UPDATE bricks_sessions
                SET expires_at = $2, last_used_at = NOW()
                WHERE token_hash = $1`,
                [tokenHash, expiresAt]
            );
        },
    };
}
