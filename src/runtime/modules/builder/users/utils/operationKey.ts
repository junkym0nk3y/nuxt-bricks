/**
 * The client-side identifier of a write operation — the `Idempotency-Key` of the
 * account creation.
 *
 * Made by the CLIENT rather than handed out by the server: it has to travel with the
 * very FIRST request, otherwise an attempt whose answer never arrived has no name, and
 * a repeat cannot ask about it.
 */

/** How many random bytes go into a key: 16 bytes, that is 32 hex characters */
const OPERATION_KEY_BYTES = 16;

/**
 * Generates a key of an operation.
 *
 * Through `crypto.getRandomValues` rather than `crypto.randomUUID`: the latter
 * demands a secure context, so on a plain-http installation of the builder — an
 * ordinary case for a local one — it is simply absent, and the form would break on
 * its own key. `getRandomValues` is available regardless.
 *
 * @returns A key of 32 hex characters.
 */
export function generateOperationKey(): string {
    const bytes = new Uint8Array(OPERATION_KEY_BYTES);
    crypto.getRandomValues(bytes);

    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
