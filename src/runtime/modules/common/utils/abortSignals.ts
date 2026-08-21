/**
 * Request cancellation signals: our own waiting ceiling and the combination of
 * signals (pure isomorphic utilities).
 *
 * The ceiling is expressed as a signal rather than as the ofetch `timeout` option
 * because the ofetch timer is cleared right after the headers arrive (a `finally`
 * around a single `await fetch(...)`), while the body is read later — a backend
 * that returned the status and then hung in the middle of the JSON would hold the
 * promise forever. A live signal aborts both phases: per the fetch specification
 * the body stream is tied to it.
 *
 * The combination is needed wherever the caller passed a signal of their own:
 * ofetch builds its internal timeout abort only when a `signal` is NOT passed, so
 * the ceiling and the caller's cancellation have to be brought together into one
 * signal explicitly.
 *
 * The utilities live in `common`, the bottom layer: they are used both by the
 * request policy of the builder and by the clients of the public render.
 */

/**
 * Upper bound of a timer delay: `setTimeout` in Node silently truncates anything
 * above 2^31−1 down to 1 ms, while `AbortSignal.timeout` throws a `RangeError` on
 * such a value before the request is even sent. Both platforms are brought to the
 * same edge.
 */
const MAX_TIMER_DELAY_MS = 2_147_483_647;

/**
 * Brings the ceiling to a delay both timer mechanisms will accept.
 *
 * `AbortSignal.timeout` is stricter than `setTimeout`: a non-integer, `Infinity`,
 * a negative value or one above 2^31−1 is rejected by it with a synchronous
 * `RangeError`, that is, the request would fail before being sent — and it would
 * fail only where the native API exists. The values also come from user
 * configuration (`bricks.dataSources.timeoutMs`), where there is no validation at
 * all, so garbage is neutralized here: an uninterpretable value turns into the maximum
 * delay — "effectively without a ceiling" is better than the failure of every
 * request in a row.
 *
 * @param timeoutMs - Waiting ceiling in milliseconds.
 * @returns An integer delay within the range the timer allows.
 */
function toTimerDelayMs(timeoutMs: number): number {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        return MAX_TIMER_DELAY_MS;
    }

    return Math.min(Math.ceil(timeoutMs), MAX_TIMER_DELAY_MS);
}

/**
 * Returns a signal that aborts once the ceiling has elapsed, with an error named
 * `TimeoutError` — the very name the callers recognize the abort by
 * (`isRequestTimeoutError`).
 *
 * Prefers the native `AbortSignal.timeout` (its timer does not hold the Node event
 * loop); the fallback on a controller of our own is there for environments without
 * that API — without the check every request would fail with a `TypeError` before
 * being sent. The fallback timer is only cleared by firing: the ofetch `onRequest`
 * hook finishes long before the response, so there is nothing to clear it from.
 * The price is a timer object living until the end of the ceiling after the request
 * has already finished; the alternative (clearing it in `onResponse`) would leave
 * the reading of the body — the very thing the signal is set for — without a
 * ceiling.
 *
 * @param timeoutMs - Waiting ceiling in milliseconds.
 * @returns A signal that aborts once the ceiling has elapsed.
 */
export function createTimeoutSignal(timeoutMs: number): AbortSignal {
    const delayMs = toTimerDelayMs(timeoutMs);

    if (typeof AbortSignal.timeout === 'function') {
        return AbortSignal.timeout(delayMs);
    }

    const controller = new AbortController();
    const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
        const error = new Error('The operation was aborted due to timeout');
        error.name = 'TimeoutError';
        controller.abort(error);
    }, delayMs);

    // In Node an uncleared timer would keep the process alive until the end of the
    // ceiling — the SSR render and the prerender would wait for a request that has
    // already been answered; in the browser `setTimeout` returns a number, which
    // has no such method
    if (typeof timer === 'object' && typeof timer.unref === 'function') {
        timer.unref();
    }

    return controller.signal;
}

/**
 * Returns a signal that aborts as soon as any of the input ones aborts.
 * Prefers the native `AbortSignal.any`; the fallback is a controller with
 * once-listeners on the input signals (the listeners are removed automatically
 * when the combined signal aborts, through the `signal` option of
 * addEventListener).
 *
 * @param signals - Input signals (a non-empty array).
 * @returns The combined signal (a single input one is returned as is).
 */
export function combineAbortSignals(signals: AbortSignal[]): AbortSignal {
    if (signals.length === 1) {
        return signals[0];
    }

    if (typeof AbortSignal.any === 'function') {
        return AbortSignal.any(signals);
    }

    const controller = new AbortController();

    for (const signal of signals) {
        if (signal.aborted) {
            controller.abort(signal.reason);
            break;
        }

        signal.addEventListener('abort', () => controller.abort(signal.reason), {
            once: true,
            signal: controller.signal,
        });
    }

    return controller.signal;
}
