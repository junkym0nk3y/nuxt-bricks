// #region Data
/**
 * Length of the generated password.
 *
 * Noticeably above the server minimum (8) on purpose: the minimum is the bound of
 * what will be accepted from a person, while the generator sets a password nobody
 * memorizes — it is copied once, and there is nothing to save on its length.
 */
const GENERATED_PASSWORD_LENGTH = 20;

/**
 * The generator's alphabet: Latin letters, digits and some of the signs — without
 * the visually indistinguishable characters (`0`, `O`, `o`, `1`, `l`, `I`) and
 * without quotes, slashes and the space.
 *
 * The reason is not strength but handover: an administrator either dictates the
 * generated password or pastes it into a chat, and `l` instead of `1` turns into
 * "the password does not work" with no explanation. Quotes and backslashes are out
 * because both have to be escaped in a shell string and in JSON, and a password that
 * needs escaping comes back mangled from wherever it was pasted.
 */
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789-_.+@';
// #endregion

/**
 * Generates a password for a new account and for resetting someone else's.
 *
 * The source of randomness is `crypto.getRandomValues` rather than `Math.random`:
 * the latter is predictable from a handful of emitted values, and what is being
 * generated here is real access to the system. A character is picked through
 * rejection sampling: taking the remainder of the division without it would make
 * the first characters of the alphabet likelier than the rest, because 256 is not
 * divisible by the alphabet length.
 *
 * @returns A password `GENERATED_PASSWORD_LENGTH` characters long.
 */
export function generateUserPassword(): string {
    const alphabetLength = PASSWORD_ALPHABET.length;
    // The first rejected byte value: everything from it upward is thrown away, without
    // which the distribution would skew toward the start of the alphabet
    const acceptableCeiling = Math.floor(256 / alphabetLength) * alphabetLength;
    const password: string[] = [];

    while (password.length < GENERATED_PASSWORD_LENGTH) {
        const bytes = new Uint8Array(GENERATED_PASSWORD_LENGTH);
        globalThis.crypto.getRandomValues(bytes);

        for (const byte of bytes) {
            if (byte >= acceptableCeiling) {
                continue;
            }

            password.push(PASSWORD_ALPHABET[byte % alphabetLength]);

            if (password.length === GENERATED_PASSWORD_LENGTH) {
                break;
            }
        }
    }

    return password.join('');
}
