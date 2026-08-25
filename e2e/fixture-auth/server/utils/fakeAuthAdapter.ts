/**
 * The account store of the auth fixture: one user and its sessions, in memory.
 *
 * Only the part of `IAuthAdapter` the login path uses is implemented, and it is
 * implemented honestly rather than stubbed: the freshness requirement of the
 * contract is what the browser test is checking. A session is handed out only
 * while it has not expired, the account is active and its credentials generation
 * still matches the one recorded at login — so a deactivation or a password
 * change takes effect on the next request rather than after the cookie's week.
 *
 * The password hash is a constant rather than something computed at startup:
 * scrypt with the parameters of the package costs a noticeable fraction of a
 * second and runs under the process-wide semaphore, and paying that on every boot
 * of the fixture buys nothing. It is a real hash of the fixture password, so the
 * login goes through the same verification as in production.
 *
 * Everything the section of accounts would call throws instead of answering: that
 * section is not part of the scenario, and a silent stub would let a test pass on
 * a path nobody implemented.
 */

// #region Imports
// Types
import type {
    IAuthAdapter,
    IAuthSessionUser,
    IAuthSessionWithUser,
    IAuthUserRecord,
    ICreateAuthSessionPayload,
} from '../../../../src/runtime/modules/persistence/types/authAdapters';
// #endregion

// #region Data
/** Login of the only account of the fixture */
export const FIXTURE_USERNAME = 'e2e-editor';

/** Its password; the hash below is the scrypt of exactly this string */
export const FIXTURE_PASSWORD = 'e2e-password';

/**
 * `scrypt:N:r:p:saltB64:hashB64` of the fixture password with the parameters the
 * package itself uses.
 */
const FIXTURE_PASSWORD_HASH =
    'scrypt:16384:8:1:ZTJlLWF1dGgtZml4dHVyZS1zYWx0LTAwMA==:AjwhFhj93/TDRsw9jL+dKDkBQeh1HU12bxE2exNBW41EnxsrdNltmAg81jCefwIjgaqqD8BoLb/4jGAd4UtsYg==';

/**
 * The role is `editor` rather than `admin` on purpose: the dashboard of an
 * administrator loads the section of accounts, and that section would drag the
 * whole management half of the contract into a fixture that has no business
 * implementing it.
 */
const FIXTURE_USER: IAuthUserRecord = {
    id: 1,
    username: FIXTURE_USERNAME,
    passwordHash: FIXTURE_PASSWORD_HASH,
    isActive: true,
    role: 'editor',
    authVersion: 1,
};

const FIXTURE_SESSION_USER: IAuthSessionUser = {
    id: FIXTURE_USER.id,
    username: FIXTURE_USER.username,
    isActive: FIXTURE_USER.isActive,
    role: FIXTURE_USER.role,
    authVersion: FIXTURE_USER.authVersion,
    displayName: null,
    avatarUrl: null,
    isDefaultPassword: false,
};

interface IFixtureSession {
    tokenHash: string;
    userId: number;
    expiresAt: Date;
    lastUsedAt: Date;
    authVersion: number;
}

const sessions = new Map<string, IFixtureSession>();
// #endregion

// #region Methods
/**
 * Refuses a call the fixture deliberately does not implement.
 *
 * @param method - Name of the contract method.
 * @returns Never: it always throws.
 */
function notImplemented(method: string): never {
    throw new Error(`[e2e-auth-fixture] ${method} is out of the scenario of this fixture`);
}

/**
 * Builds the account store of the fixture.
 *
 * @returns An `IAuthAdapter` over one user and a map of sessions.
 */
export function createFakeAuthAdapter(): IAuthAdapter {
    return {
        /**
         * The lookup is case-insensitive, the way the login form is used.
         *
         * @param username - Login typed by the person.
         * @returns The account, or null.
         */
        async getUserByUsername(username: string): Promise<IAuthUserRecord | null> {
            return username.toLowerCase() === FIXTURE_USERNAME ? { ...FIXTURE_USER } : null;
        },

        /**
         * @param tokenHash - SHA-256 of the cookie token.
         * @returns The session with its user, or null when it is expired, revoked
         * or absent.
         */
        async getSessionWithUser(tokenHash: string): Promise<IAuthSessionWithUser | null> {
            const session = sessions.get(tokenHash);

            if (!session) {
                return null;
            }

            const isFresh =
                session.userId === FIXTURE_USER.id &&
                session.expiresAt.getTime() > Date.now() &&
                session.authVersion === FIXTURE_USER.authVersion &&
                FIXTURE_USER.isActive;

            if (!isFresh) {
                sessions.delete(tokenHash);

                return null;
            }

            return {
                tokenHash,
                expiresAt: session.expiresAt.toISOString(),
                lastUsedAt: session.lastUsedAt.toISOString(),
                user: { ...FIXTURE_SESSION_USER },
            };
        },

        /**
         * @param payload - Token hash, user, expiry and the generation read before
         * the password check.
         * @returns False when the generation moved between the check and the insert.
         */
        async createSession(payload: ICreateAuthSessionPayload): Promise<boolean> {
            // The account is checked as well, not only the generation: a store that
            // opens a session for whatever id it is handed would hide a caller mixing
            // up users, and the browser test would stay green on it
            if (
                payload.userId !== FIXTURE_USER.id ||
                payload.expectedAuthVersion !== FIXTURE_USER.authVersion ||
                !FIXTURE_USER.isActive
            ) {
                return false;
            }

            sessions.set(payload.tokenHash, {
                tokenHash: payload.tokenHash,
                userId: payload.userId,
                expiresAt: payload.expiresAt,
                lastUsedAt: new Date(),
                authVersion: FIXTURE_USER.authVersion,
            });

            return true;
        },

        /**
         * @param tokenHash - SHA-256 of the cookie token.
         */
        async deleteSession(tokenHash: string): Promise<void> {
            sessions.delete(tokenHash);
        },

        /**
         * @returns How many expired sessions were dropped.
         */
        async deleteExpiredSessions(): Promise<number> {
            const now = Date.now();
            let deleted = 0;

            for (const [tokenHash, session] of sessions) {
                if (session.expiresAt.getTime() <= now) {
                    sessions.delete(tokenHash);
                    deleted += 1;
                }
            }

            return deleted;
        },

        /**
         * Sliding extension of a living session.
         *
         * @param tokenHash - SHA-256 of the cookie token.
         * @param expiresAt - The new expiry.
         */
        async touchSession(tokenHash: string, expiresAt: Date): Promise<void> {
            const session = sessions.get(tokenHash);

            if (session) {
                session.expiresAt = expiresAt;
                session.lastUsedAt = new Date();
            }
        },

        /** @returns Never: the section of accounts is out of the scenario. */
        listUsers: () => notImplemented('listUsers'),
        /** @returns Never: the section of accounts is out of the scenario. */
        claimUserCreateOperation: () => notImplemented('claimUserCreateOperation'),
        /** @returns Never: the section of accounts is out of the scenario. */
        createUserForOperation: () => notImplemented('createUserForOperation'),
        /** @returns Never: the section of accounts is out of the scenario. */
        releaseUserCreateOperation: () => notImplemented('releaseUserCreateOperation'),
        /** @returns Never: the section of accounts is out of the scenario. */
        updateUserState: () => notImplemented('updateUserState'),
        /** @returns Never: the section of accounts is out of the scenario. */
        updateUserPassword: () => notImplemented('updateUserPassword'),
        /** @returns Never: the profile is out of the scenario. */
        updateUserProfile: () => notImplemented('updateUserProfile'),
        /** @returns Never: the profile is out of the scenario. */
        updateOwnPassword: () => notImplemented('updateOwnPassword'),
        /** @returns Never: the section of accounts is out of the scenario. */
        deleteUser: () => notImplemented('deleteUser'),
    };
}
// #endregion
