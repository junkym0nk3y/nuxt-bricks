/**
 * Types of the role model of database auth.
 *
 * They live in common: the role is needed by the server (the endpoint guard, the
 * permission matrix) and by the client (which actions to draw in the builder and
 * in the dashboard) alike, and common is the bottom layer available to both sides.
 */

/**
 * Role of an account.
 *
 * - `admin` — deletion (of pages, versions, media, categories) and account management;
 * - `editor` — saving, publishing, media uploads, the device set;
 * - `viewer` — read only.
 *
 * The roles are strictly nested: the permissions of `viewer` ⊂ `editor` ⊂ `admin`,
 * so a check comes down to comparing ranks (`BRICKS_ROLE_RANK`) rather than to
 * enumerating the permissions of every role.
 */
export type TBricksUserRole = 'admin' | 'editor' | 'viewer';

/**
 * An account in the responses of the user management section
 * (`GET /api/bricks/users` and every endpoint returning an account row after an
 * edit).
 *
 * It lives in common rather than in the adapter contract because of the module
 * boundaries: the type is needed by the server (the persistence implementation, the
 * endpoint projections) and by the client (the "Users" section of the dashboard),
 * while `persistence` is a server-only layer the client is forbidden to import from
 * by a dependency-cruiser rule (the graph counts type-only imports too). A second
 * declaration of the same shape in a client domain would drift away from the
 * server-side one silently — on adding a column only one copy would be edited.
 *
 * There are no secrets here: no password hash and no credential generation
 * (`auth_version` is a detail of the session revocation mechanism and has no
 * business going outside).
 */
export interface IBricksUserSummary {
    id: number;
    username: string;
    role: TBricksUserRole;
    isActive: boolean;
    /** Display name; null — the login is shown everywhere */
    displayName: string | null;
    /** Link to the profile photo; null — a letter placeholder */
    avatarUrl: string | null;
    /** ISO 8601 UTC — the moment the account was created */
    createdAt: string;
    /**
     * ISO 8601 UTC — the moment of the last SUCCESSFUL sign-in; null — never signed
     * in. Written by the same operation that creates the session, so it reflects a
     * sign-in specifically rather than any activity.
     *
     * Not derived from `bricks_sessions.last_used_at`: session rows go away on
     * sign-out, on a revocation of permissions, on the cleanup of expired ones and
     * on the deletion of an account — by their absence, "never signed in" would be
     * a lie about everybody who signed out.
     */
    lastLoginAt: string | null;
}
