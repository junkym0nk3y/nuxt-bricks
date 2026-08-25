/**
 * The envelope of parameters a stored hash string is allowed to ask for.
 *
 * The string decides the parameters of its own verification, and it comes from the
 * store: an external account adapter, a restored dump or a hand-edited column all end
 * up in `verifyPassword`. Memory is bounded by `maxmem`, which node checks against the
 * memory table only — `p` multiplies the time and is invisible to it. So a row of
 * perfectly legal memory and an absurd `p` would hold both slots of the semaphore for
 * as long as it liked and answer 503 to everyone else.
 *
 * crypto is mocked here on purpose: the check being proved is that the derivation is
 * never STARTED for such a string. With the real one the spec would either wait out
 * the very derivation it forbids, or prove nothing.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';
// #endregion

// #region Mocks
const { scryptMock } = vi.hoisted(() => ({
    scryptMock: vi.fn(),
}));

vi.mock('node:crypto', async (importOriginal) => {
    const original = await importOriginal<Record<string, unknown>>();

    return {
        ...original,
        scrypt: scryptMock,
    };
});

const { verifyPassword } = await import('../../src/runtime/server/utils/auth/passwords');
// #endregion

// #region Data
/** Sixteen times the work of the current profile: N=2^14, r=8, p=5 */
const MAX_WORK = 16384 * 8 * 5 * 16;
// #endregion

beforeEach(() => {
    scryptMock.mockReset();
    // A derivation that never matches: the answer of verify is not what is measured
    scryptMock.mockImplementation((password, salt, keylen, options, callback) => {
        callback(null, Buffer.alloc(keylen, 1));
    });
});

describe('passwords: the envelope of a stored string', () => {
    it('derives for a string inside the envelope', async () => {
        await expect(
            verifyPassword('secret123', 'scrypt:16384:8:5:c2FsdA==:aGFzaA==')
        ).resolves.toBe(false);

        expect(scryptMock).toHaveBeenCalledTimes(1);
        const options = scryptMock.mock.calls[0][3];
        expect(options).toMatchObject({ N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 });
    });

    it('accepts a string of the previous profile of the package', async () => {
        await expect(
            verifyPassword('secret123', 'scrypt:16384:8:1:c2FsdA==:aGFzaA==')
        ).resolves.toBe(false);

        expect(scryptMock).toHaveBeenCalledTimes(1);
    });

    it('refuses a work bomb without starting the derivation', async () => {
        const bomb = `scrypt:16384:8:${MAX_WORK}:c2FsdA==:aGFzaA==`;

        await expect(verifyPassword('secret123', bomb)).resolves.toBe(false);

        expect(scryptMock).not.toHaveBeenCalled();
    });

    it('refuses a huge N by the same ceiling', async () => {
        await expect(
            verifyPassword('secret123', 'scrypt:1073741824:8:1:c2FsdA==:aGFzaA==')
        ).resolves.toBe(false);

        expect(scryptMock).not.toHaveBeenCalled();
    });

    // Three factors of the size of a safe integer would lose precision in one product,
    // and the comparison would pass on a string that has to be refused
    it('refuses factors that would overflow a single product', async () => {
        const huge = String(Number.MAX_SAFE_INTEGER);

        await expect(
            verifyPassword('secret123', `scrypt:${huge}:${huge}:${huge}:c2FsdA==:aGFzaA==`)
        ).resolves.toBe(false);

        expect(scryptMock).not.toHaveBeenCalled();
    });

    it('refuses a parameter with trailing garbage before any derivation', async () => {
        await expect(
            verifyPassword('secret123', 'scrypt:16384junk:8:5:c2FsdA==:aGFzaA==')
        ).resolves.toBe(false);

        expect(scryptMock).not.toHaveBeenCalled();
    });
});
