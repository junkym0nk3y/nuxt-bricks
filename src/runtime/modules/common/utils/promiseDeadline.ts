/**
 * A wall-clock deadline around a promise (a pure isomorphic utility).
 *
 * Needed where the transport ceiling does not work: on SSR relative URLs are served
 * by an internal Nitro call (`fetchNodeRequestHandler`), and it does not listen to an
 * `AbortSignal` at all — neither the ofetch `timeout` nor the caller's own
 * `AbortController` will abort such a request. The only thing left from the outside
 * is to stop waiting for it.
 *
 * The handler keeps working meanwhile: the race releases the waiter, not the
 * resource. The resource itself needs a server-side limit (the HTTP backend has one
 * — `persistence/server/http/httpClient.ts`).
 */

/**
 * Waits for a promise no longer than the deadline.
 *
 * @param operation - The promise being awaited.
 * @param timeoutMs - Waiting ceiling in milliseconds.
 * @param createTimeoutError - Factory of the deadline error: the text and the type
 * are the caller's decision (for the SSR lookup it is an HTTP status, for the session
 * a localized string).
 * @returns The value of the promise.
 * @throws The error from `createTimeoutError` when the deadline elapsed first.
 */
export function withPromiseDeadline<T>(
    operation: Promise<T>,
    timeoutMs: number,
    createTimeoutError: () => Error
): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(createTimeoutError()), timeoutMs);
    });

    // The timer is cleared in both outcomes: an uncleared one would keep the Node
    // event loop open until the end of the deadline on every SSR request
    return Promise.race([operation, deadline]).finally(() => {
        if (timer !== null) {
            clearTimeout(timer);
        }
    });
}
