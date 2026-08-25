import { createError, defineEventHandler, setResponseHeader } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';
import { useBricksAuthAdapter } from '../../../../modules/persistence/server/registry';
import {
    readNormalizedBody,
    toHttpError,
} from '../../../../modules/persistence/server/utils/handlerHelpers';
import {
    hashPassword,
    needsPasswordRehash,
    verifyPassword,
    DUMMY_PASSWORD_HASH,
} from '../../../utils/auth/passwords';
import {
    buildRateLimitKey,
    isIpLockedOut,
    isLockedOut,
    registerFailure,
    registerIpFailure,
    resetFailures,
} from '../../../utils/auth/loginRateLimiter';
import {
    GateOverflowError,
    runScryptTask,
    runScryptTaskIfIdle,
} from '../../../utils/auth/scryptGate';
import {
    generateSessionToken,
    hashSessionToken,
    resolveSessionMaxAgeSeconds,
    setSessionCookie,
} from '../../../utils/auth/sessionCookie';
import { resolveRequestClientIp } from '../../../utils/requestClientIp';
import type { IAuthAdapter } from '../../../../modules/persistence/types/authAdapters';
import type {
    IAuthLoginBody,
    IAuthLoginCandidate,
    IAuthLoginCredentials,
} from '../../../utils/auth/types';

/** Maximum username length (equals VARCHAR(255) in the database) */
const MAX_USERNAME_LENGTH = 255;
/** Maximum password length (a sanity bound against a DoS through scrypt) */
const MAX_PASSWORD_LENGTH = 1024;

/**
 * Validates the login body; 400 when the fields are missing or out of bounds.
 */
function validateLoginBody(body: IAuthLoginBody): IAuthLoginCredentials {
    const { username, password } = body;

    if (
        typeof username !== 'string' ||
        typeof password !== 'string' ||
        username.length === 0 ||
        password.length === 0 ||
        username.length > MAX_USERNAME_LENGTH ||
        password.length > MAX_PASSWORD_LENGTH
    ) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Username and password are required',
        });
    }

    return { username, password };
}

/**
 * Verifies the credentials: verify always runs (against DUMMY_PASSWORD_HASH when
 * the username is unknown) — timing equalization, anti-enumeration.
 *
 * It also returns the credential generation read BEFORE the password check: that
 * generation goes into the session insert as a condition, so a password change or
 * a deactivation that managed to land during the scrypt check cancels this
 * sign-in.
 */
async function verifyCredentials(
    auth: IAuthAdapter,
    username: string,
    password: string
): Promise<IAuthLoginCandidate | null> {
    const user = await auth.getUserByUsername(username);
    const isPasswordValid = await runScryptTask(() =>
        verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH)
    );

    if (!user || !isPasswordValid || !user.isActive) {
        return null;
    }

    return {
        id: user.id,
        username: user.username,
        role: user.role,
        authVersion: user.authVersion,
        passwordHash: user.passwordHash,
    };
}

/**
 * Rewrites the password hash with the current scrypt parameters when the stored one is
 * weaker — the migration of an old row, paid for by the first sign-in after the
 * parameters were raised and never again.
 *
 * Three properties of this step matter more than the step itself.
 *
 * It never fails the sign-in: the credentials have been verified and the session
 * created, so a store that refused the write, or a derivation that threw, changes
 * nothing for the person signing in.
 *
 * It never takes a slot away from somebody who is waiting. The derivation goes through
 * the gate in its opportunistic form: with a busy gate the rehash is skipped rather
 * than queued, and the next sign-in tries again. Otherwise the first sign-in of every
 * old account would cost two derivations of the queue instead of one, and a burst of
 * them would answer 503 to people who could have been let in.
 *
 * It never raises the credentials generation — that is what makes it a separate method
 * of the adapter rather than a reuse of the password write. A raised generation would
 * revoke the session created a line above, that is throw the person out with the very
 * cookie they were about to be handed.
 *
 * @param auth - The account store.
 * @param user - The signed-in candidate, with the hash its password was verified
 * against.
 * @param password - The plaintext password (verified a moment ago).
 */
async function rehashPasswordIfWeak(
    auth: IAuthAdapter,
    user: IAuthLoginCandidate,
    password: string
): Promise<void> {
    if (!needsPasswordRehash(user.passwordHash)) {
        return;
    }

    try {
        const nextPasswordHash = await runScryptTaskIfIdle(() => hashPassword(password));

        if (nextPasswordHash === null) {
            return;
        }

        await auth.rehashUserPassword(user.id, {
            currentPasswordHash: user.passwordHash,
            nextPasswordHash,
            expectedAuthVersion: user.authVersion,
        });
    } catch (error: unknown) {
        // The sign-in has already succeeded: a failed rehash is a postponed one, not
        // a failed login. The hash itself never reaches the log
        console.error('[nuxt-bricks] Failed to rehash the password of a signed-in user:', error);
    }
}

/**
 * POST /api/bricks/auth/login — sign-in by username and password (database mode).
 * On success: creates a cookie session and returns { user: { id, username } }.
 * On failure — a single 401 'Invalid credentials' (no such user / wrong password
 * / deactivated). A two-level rate limit: 5 failures in 15 minutes per
 * ip|username, 30 failures in the same window per IP (with changing usernames) →
 * 429 with Retry-After; the IP lockout is checked before scrypt. The scrypt
 * verification runs under a bounded semaphore (`scryptGate`), and queue overflow
 * gives a 503.
 */
export default defineEventHandler(async (event) => {
    try {
        const config = useRuntimeConfig();

        if (config.bricksAuthMode !== 'database') {
            throw createError({ statusCode: 404, statusMessage: 'Not Found' });
        }

        const body = await readNormalizedBody<IAuthLoginBody>(event);
        const { username, password } = validateLoginBody(body);

        const clientIp = resolveRequestClientIp(event);
        const ipLockoutSeconds = isIpLockedOut(clientIp);

        if (ipLockoutSeconds > 0) {
            setResponseHeader(event, 'Retry-After', ipLockoutSeconds);
            throw createError({
                statusCode: 429,
                statusMessage: 'Too many login attempts',
            });
        }

        const rateLimitKey = buildRateLimitKey(clientIp, username);
        const lockoutSeconds = isLockedOut(rateLimitKey);

        if (lockoutSeconds > 0) {
            setResponseHeader(event, 'Retry-After', lockoutSeconds);
            throw createError({
                statusCode: 429,
                statusMessage: 'Too many login attempts',
            });
        }

        const auth = useBricksAuthAdapter();
        let user;

        try {
            user = await verifyCredentials(auth, username, password);
        } catch (error: unknown) {
            if (error instanceof GateOverflowError) {
                throw createError({
                    statusCode: 503,
                    statusMessage: 'Server is busy, try again later',
                });
            }

            throw error;
        }

        if (!user) {
            registerFailure(rateLimitKey);
            registerIpFailure(clientIp);
            throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' });
        }

        resetFailures(rateLimitKey);

        try {
            await auth.deleteExpiredSessions();
        } catch (error: unknown) {
            // A failed cleanup must not fail the sign-in
            console.error('[nuxt-bricks] Failed to delete expired sessions:', error);
        }

        const maxAgeSeconds = resolveSessionMaxAgeSeconds();
        const token = generateSessionToken();

        const isSessionCreated = await auth.createSession({
            tokenHash: hashSessionToken(token),
            userId: user.id,
            expiresAt: new Date(Date.now() + maxAgeSeconds * 1000),
            expectedAuthVersion: user.authVersion,
        });

        // The account was deactivated or had its password changed while the
        // scrypt check was running: the credentials the request came with are
        // already revoked, so there will be no session. The answer is the same 401
        // as for a wrong password: there is no point in exposing the difference
        if (!isSessionCreated) {
            throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' });
        }

        setSessionCookie(event, token, maxAgeSeconds);

        await rehashPasswordIfWeak(auth, user, password);

        return { user: { id: user.id, username: user.username, role: user.role } };
    } catch (error: unknown) {
        toHttpError(error, 'Failed to log in');
    }
});
