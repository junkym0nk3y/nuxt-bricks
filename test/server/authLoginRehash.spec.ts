// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Types
import type { H3Event } from 'h3';

// Utils
import { createFakeH3Event } from '../helpers/h3Events';
// #endregion

/**
 * Rewriting a weak password hash after a successful sign-in.
 *
 * The parameters of the hashing were raised, and old rows have to migrate without
 * anybody resetting a password. The whole point of the step is that it changes nothing
 * for the person signing in, so the checks are about what must NOT happen: the sign-in
 * does not fail when the rehash does, nothing is written when the session was refused,
 * and a busy server skips the rehash instead of making a login wait behind it.
 *
 * scrypt is not stubbed here: with a stubbed derivation the spec would stop telling
 * "the hash was recomputed" from "a function was called".
 */

// #region Mocks
const { runtimeConfig, authAdapterMock, bodyMock, setSessionCookieMock, gateState } = vi.hoisted(
    () => ({
        runtimeConfig: { bricksAuthMode: 'database' } as Record<string, unknown>,
        authAdapterMock: {
            getUserByUsername: vi.fn(),
            createSession: vi.fn(),
            deleteExpiredSessions: vi.fn(),
            rehashUserPassword: vi.fn(),
        },
        bodyMock: { value: {} as Record<string, unknown> },
        setSessionCookieMock: vi.fn(),
        gateState: { isIdle: true },
    })
);

vi.mock('nitropack/runtime', () => ({
    useRuntimeConfig: () => runtimeConfig,
}));

vi.mock('../../src/runtime/modules/persistence/server/registry', () => ({
    useBricksAuthAdapter: () => authAdapterMock,
}));

vi.mock(
    '../../src/runtime/modules/persistence/server/utils/handlerHelpers',
    async (importOriginal) => ({
        ...(await importOriginal<Record<string, unknown>>()),
        readNormalizedBody: async () => bodyMock.value,
    })
);

vi.mock('../../src/runtime/server/utils/auth/sessionCookie', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    setSessionCookie: setSessionCookieMock,
}));

// The gate itself stays real; only its opportunistic form is steered, so the "the
// server is busy" branch can be reached without occupying the process-wide semaphore
vi.mock('../../src/runtime/server/utils/auth/scryptGate', async (importOriginal) => {
    const original = await importOriginal<Record<string, unknown>>();

    return {
        ...original,
        runScryptTaskIfIdle: <T>(task: () => Promise<T>): Promise<T | null> =>
            gateState.isIdle ? task() : Promise.resolve(null),
    };
});

const login = (await import('../../src/runtime/server/api/bricks/auth/login.post')).default;
const { hashPassword, verifyPassword } =
    await import('../../src/runtime/server/utils/auth/passwords');
const { resetRateLimiterState } =
    await import('../../src/runtime/server/utils/auth/loginRateLimiter');
// #endregion

// #region Fixtures
const PASSWORD = 'correct-horse-battery';
/** The hash of the same password with the PREVIOUS parameters of the package */
const LEGACY_HASH =
    'scrypt:16384:8:1:5IeLYK86NoPx1dsDz6V3bQ==:1Dszce2HwpCU07O624v8nLSxPWssW0KdAAF4laRtns3dL0x+VnOZYSJ2arlt3RIfY6jSFr/aZ5zARELoAKm6GQ==';
const CURRENT_HASH = await hashPassword(PASSWORD);

/**
 * The account the store answers with.
 *
 * @param passwordHash - The stored hash.
 */
function userRecord(passwordHash: string) {
    return {
        id: 7,
        username: 'ivan',
        passwordHash,
        isActive: true,
        role: 'editor' as const,
        authVersion: 4,
    };
}

/**
 * Signs in through the handler.
 *
 * @param password - The password of the request.
 */
function signIn(password: string = PASSWORD): Promise<unknown> {
    bodyMock.value = { username: 'ivan', password };

    const event: H3Event = createFakeH3Event({
        path: '/api/bricks/auth/login',
        method: 'POST',
        headers: { 'x-forwarded-for': '203.0.113.7' },
    });

    return (login as unknown as (event: H3Event) => Promise<unknown>)(event);
}
// #endregion

beforeEach(() => {
    resetRateLimiterState();
    authAdapterMock.getUserByUsername.mockReset();
    authAdapterMock.createSession.mockReset().mockResolvedValue(true);
    authAdapterMock.deleteExpiredSessions.mockReset().mockResolvedValue(0);
    authAdapterMock.rehashUserPassword.mockReset().mockResolvedValue(true);
    setSessionCookieMock.mockReset();
    gateState.isIdle = true;
});

describe('login: rehash of a weak password hash', () => {
    it('rewrites a hash of the previous parameters with the current ones', async () => {
        authAdapterMock.getUserByUsername.mockResolvedValue(userRecord(LEGACY_HASH));

        await signIn();

        expect(authAdapterMock.rehashUserPassword).toHaveBeenCalledTimes(1);

        const [userId, change] = authAdapterMock.rehashUserPassword.mock.calls[0];
        expect(userId).toBe(7);
        expect(change.currentPasswordHash).toBe(LEGACY_HASH);
        expect(change.expectedAuthVersion).toBe(4);
        expect(change.nextPasswordHash.startsWith('scrypt:16384:8:5:')).toBe(true);
        // The password itself did not change: the new hash has to accept it
        await expect(verifyPassword(PASSWORD, change.nextPasswordHash)).resolves.toBe(true);
        expect(setSessionCookieMock).toHaveBeenCalledTimes(1);
    });

    it('leaves a hash of the current parameters alone', async () => {
        authAdapterMock.getUserByUsername.mockResolvedValue(userRecord(CURRENT_HASH));

        await signIn();

        expect(authAdapterMock.rehashUserPassword).not.toHaveBeenCalled();
        expect(setSessionCookieMock).toHaveBeenCalledTimes(1);
    });

    // The generation moved between the password check and the insert: the credentials
    // of the request are already revoked, so there is nothing to migrate either
    it('writes nothing when the session was refused', async () => {
        authAdapterMock.getUserByUsername.mockResolvedValue(userRecord(LEGACY_HASH));
        authAdapterMock.createSession.mockResolvedValue(false);

        await expect(signIn()).rejects.toMatchObject({ statusCode: 401 });

        expect(authAdapterMock.rehashUserPassword).not.toHaveBeenCalled();
        expect(setSessionCookieMock).not.toHaveBeenCalled();
    });

    it('keeps the sign-in successful when the store refuses the rehash', async () => {
        authAdapterMock.getUserByUsername.mockResolvedValue(userRecord(LEGACY_HASH));
        authAdapterMock.rehashUserPassword.mockResolvedValue(false);

        await expect(signIn()).resolves.toMatchObject({
            user: { id: 7, username: 'ivan', role: 'editor' },
        });
        expect(setSessionCookieMock).toHaveBeenCalledTimes(1);
    });

    it('keeps the sign-in successful when the rehash throws', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        authAdapterMock.getUserByUsername.mockResolvedValue(userRecord(LEGACY_HASH));
        authAdapterMock.rehashUserPassword.mockRejectedValue(new Error('store is down'));

        await expect(signIn()).resolves.toMatchObject({ user: { id: 7 } });
        expect(setSessionCookieMock).toHaveBeenCalledTimes(1);

        const logged = errorSpy.mock.calls.flat().join(' ');
        expect(logged).toContain('Failed to rehash');
        // Neither the password nor the hash may reach the log
        expect(logged).not.toContain(PASSWORD);
        expect(logged).not.toContain(LEGACY_HASH);

        errorSpy.mockRestore();
    });

    it('skips the rehash while the gate is busy instead of queueing behind logins', async () => {
        authAdapterMock.getUserByUsername.mockResolvedValue(userRecord(LEGACY_HASH));
        gateState.isIdle = false;

        await expect(signIn()).resolves.toMatchObject({ user: { id: 7 } });

        expect(authAdapterMock.rehashUserPassword).not.toHaveBeenCalled();
        expect(setSessionCookieMock).toHaveBeenCalledTimes(1);
    });

    it('does not rehash after a refused sign-in', async () => {
        authAdapterMock.getUserByUsername.mockResolvedValue(userRecord(LEGACY_HASH));

        await expect(signIn('wrong-password')).rejects.toMatchObject({ statusCode: 401 });

        expect(authAdapterMock.rehashUserPassword).not.toHaveBeenCalled();
    });
});
