// #region Imports
// Utils
import { withPromiseDeadline } from '../../common/utils/promiseDeadline';

// Constants
import {
    BRICKS_API_READ_TIMEOUT_MS,
    BRICKS_SSR_DEADLINE_MARGIN_MS,
} from '../../common/constants/apiTimeouts';
// #endregion

// #region Methods
/**
 * Bounds the SSR page lookup in time.
 *
 * Why an external deadline is needed: on SSR relative URLs go out as an internal
 * Nitro call, and it does not listen to an `AbortSignal` — that is, the signal
 * with which the request policy holds the transport ceiling is inert for such a
 * call. A hung handler would hold the entire SSR response, and the visitor would
 * wait forever. The race does not stop the handler, but it does stop waiting for
 * it.
 *
 * Why with a margin rather than exactly the read ceiling: equal boundaries turn
 * the outcome into a coin toss. The handler may have been about to return an
 * error of its own, with a real status and a real reason (the external backend
 * timing out, for one), and the generic `TimeoutError` of the external deadline
 * would have buried it. The margin lets the real error surface first and leaves
 * the deadline as a backstop. What it costs: on a hung lookup we wait out the
 * margin on top before giving up.
 *
 * Why on the server only: on the client both fetchers (`publicPageFetcher` and
 * `apiFetcher`) install a live signal covering both the headers and the reading
 * of the body — a second timer there is redundant and would get in the way of
 * overriding the ceiling per call.
 *
 * The error carries the name `TimeoutError`, so it goes through the same
 * `isRequestTimeoutError` as an abort on the client does.
 *
 * @param operation - The lookup promise.
 * @param isServer - Whether the code runs on the server (SSR).
 * @returns The lookup promise with a deadline on SSR, or the same promise
 * unchanged on the client.
 */
export function withPageLookupDeadline<T>(operation: Promise<T>, isServer: boolean): Promise<T> {
    if (!isServer) {
        return operation;
    }

    return withPromiseDeadline(
        operation,
        BRICKS_API_READ_TIMEOUT_MS + BRICKS_SSR_DEADLINE_MARGIN_MS,
        () => {
            const error = new Error('Bricks page lookup timed out');
            error.name = 'TimeoutError';

            return error;
        }
    );
}
// #endregion
