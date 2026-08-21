/**
 * The default IAuthAdapter over PostgreSQL (the bricks_users / bricks_sessions
 * tables). The tables' schema comes from the versioned migrations migrations/*.sql
 * (the bricks-migrate CLI); the adapter runs no runtime DDL.
 *
 * Here — reading an account for login and the lifecycle of the cookie sessions. The
 * mutations of the account row itself (role, activity, passwords, profile, deletion)
 * live in `postgresAuthUserMethods.ts` and are mixed in with a spread: they have edge
 * rules and locks of their own, and together the file kept outgrowing the 500-line
 * ceiling.
 */
import { query, queryOne } from './client';
import { createPostgresAuthUserMethods } from './postgresAuthUserMethods';
import { BRICKS_DEFAULT_ADMIN_PASSWORD_HASH } from '../utils/defaultAdmin';
import type {
    IAuthAdapter,
    IAuthUserRecord,
    IAuthSessionWithUser,
    ICreateAuthSessionPayload,
} from '../../types/authAdapters';
import type { IAuthSessionJoinRow } from '../../types/postgres';

/**
 * Creates the Postgres implementation of IAuthAdapter.
 *
 * @returns The adapter of users and cookie sessions.
 */
export function createPostgresAuthAdapter(): IAuthAdapter {
    return {
        /**
         * Returns a user by username (the password hash included), or null.
         * The lookup is case-insensitive — under the unique index on
         * lower(username); a case-sensitive lookup would drift away from the login
         * rate limiter, which counts `Admin` and `admin` as one key of attempts.
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
         * Returns an unexpired session together with its user, or null.
         * An expired session is indistinguishable from an absent one (the SQL filter
         * on expires_at).
         *
         * The `s.auth_version = u.auth_version` match is what carries the revocation
         * of rights: a password change, a deactivation and a role change raise the
         * account's generation, and every former session stops matching in the very
         * request that reads it. Relying on the deletion of the session rows instead
         * is not allowed: a separate DELETE can fail after the password change has
         * already succeeded.
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
                    u.avatar_url AS "avatarUrl",
                    -- Whether the password is the default one is computed here
                    -- rather than by a separate query: the interface needs it on
                    -- every entry into the builder, and comparing a hash string
                    -- costs nothing next to a JOIN that is already running. The
                    -- hash itself never leaves the database in the process.
                    (u.password_hash = $2) AS "isDefaultPassword"
                FROM bricks_sessions s
                JOIN bricks_users u ON u.id = s.user_id
                WHERE s.token_hash = $1
                    AND s.expires_at > NOW()
                    AND s.auth_version = u.auth_version`,
                [tokenHash, BRICKS_DEFAULT_ADMIN_PASSWORD_HASH]
            );

            if (!row) {
                return null;
            }

            return {
                tokenHash: row.tokenHash,
                // A TIMESTAMPTZ column: node-postgres returns a Date — it is
                // normalized to an ISO string, and the
                // IAuthSessionWithUser.expiresAt contract stays a string
                // (ISO 8601 UTC).
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
                    isDefaultPassword: row.isDefaultPassword,
                },
            };
        },

        /**
         * Creates a session (the database holds only the token's SHA-256 hex) if the
         * account is still active and its generation matches the one read before the
         * password check, and marks the moment of login in the same request.
         *
         * The insert is conditional rather than unconditional: the password check runs
         * for seconds under scrypt, and a parallel password change or deactivation
         * could have finished ahead of the insert — an unconditional INSERT would then
         * hand out a working session on credentials already revoked.
         *
         * The login mark lives in a CTE of the same request rather than in a separate
         * UPDATE, and its condition is the same one. The order here is the whole point
         * of the construction: writing the date BEFORE the conditional insert would
         * mark a login that never happened (the account was deactivated in time),
         * while a separate request AFTER the session's commit could be lost, leaving
         * whoever logged in without a date. In a single statement both writes are
         * applied together or not at all. `auth_version` does not move in the process:
         * logging in is not a revocation of rights, and an increment would put out the
         * session just created.
         *
         * @returns false — the account's state changed, the cookie must not be set.
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
         * Deletes a session by its token hash (logout / revocation).
         */
        async deleteSession(tokenHash: string): Promise<void> {
            await query('DELETE FROM bricks_sessions WHERE token_hash = $1', [tokenHash]);
        },

        /**
         * Deletes expired sessions; returns how many were deleted.
         */
        async deleteExpiredSessions(): Promise<number> {
            const rows = await query<{ id: number }>(
                'DELETE FROM bricks_sessions WHERE expires_at <= NOW() RETURNING id'
            );

            return rows.length;
        },

        /**
         * Sliding extension: updates the session's expires_at and last_used_at.
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
