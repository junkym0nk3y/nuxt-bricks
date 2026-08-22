/**
 * Database-auth types: the mode, the role guard and the H3EventContext augmentation.
 */
import type { IAuthSessionUser } from '../../../modules/persistence/types/authAdapters';
import type { IBricksRoutePrefixes } from '../../../modules/common/utils/bricks/routePaths';
import type { TBricksUserRole } from '../../../modules/common/types/auth';

/** Authentication mode of the protected paths */
export type TBricksAuthMode = 'basic' | 'database';

/** Login request body (before validation the fields are arbitrary) */
export interface IAuthLoginBody {
    username?: unknown;
    password?: unknown;
}

/** Validated login credentials */
export interface IAuthLoginCredentials {
    username: string;
    password: string;
}

/**
 * A sign-in candidate: the password check passed, but there is no session yet.
 * `authVersion` was read BEFORE the scrypt check and goes into the insert as a
 * condition.
 */
export interface IAuthLoginCandidate {
    id: number;
    username: string;
    role: TBricksUserRole;
    authVersion: number;
}

/**
 * Account projection in the "who am I" responses: the `me` handler and the
 * own-profile handlers.
 *
 * One shape for all three sources (the session, the row after a profile edit,
 * the row after a photo change) — otherwise the corner of the screen would be
 * left guessing what exactly arrived. The activity flag, the generation and the
 * creation date are absent here: the profile interface does not need them, and
 * an inactive account never reaches these handlers at all.
 */
export interface IAuthProfileUser {
    id: number;
    username: string;
    role: TBricksUserRole;
    /** Display name; null means the username is shown */
    displayName: string | null;
    /** Link to the profile photo; null means the letter placeholder */
    avatarUrl: string | null;
}

/** Validated body of editing one's own profile */
export interface IAuthProfileInput {
    /** Display name; null means clear it and show the username */
    displayName: string | null;
}

/** Validated body of changing one's own password */
export interface IAuthOwnPasswordInput {
    /**
     * The current password is mandatory precisely here: without it a stolen
     * cookie would change the password on its own and lock the owner out.
     */
    currentPassword: string;
    newPassword: string;
}

/**
 * Access requirement for an `/api/bricks/**` path.
 * `null` — the path is open to everyone (public read model, health, component
 * manifest); `'authenticated'` — any valid session is enough (one's own
 * profile); a role — the minimum rank from `BRICKS_ROLE_RANK`.
 */
export type TBricksAccessRequirement = TBricksUserRole | 'authenticated' | null;

/** Parsed request target for the auth middleware (logical path without baseURL) */
export interface IAuthRequestTarget {
    /** Path without `app.baseURL` and query — the input of the protection matrix */
    logicalPathname: string;
    /** Query string of the request (with a leading `?`, or empty) */
    search: string;
    /** Active bricks route prefixes */
    prefixes: IBricksRoutePrefixes;
    /** `app.baseURL` of the application (used to build the redirect URL) */
    baseURL: string;
}

declare module 'h3' {
    interface H3EventContext {
        /**
         * User of an authorized database-auth session (put here by the auth
         * middleware).
         */
        bricksUser?: IAuthSessionUser;
    }
}
