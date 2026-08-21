/**
 * Request policy: selecting the timeout ceiling for each method and detecting
 * when it fires. Pure functions with no Nuxt context, applied by all three
 * transports of the project inside their own fetcher wrapper: the builder client
 * (`composables/useApiClient.ts`) and the public render clients (page lookup,
 * data sources). Not in an ofetch `onRequest` hook — the reason is spelled out in
 * `useApiClient.ts`.
 *
 * The policy expects clients without retries (`retry: 0` in all three). With
 * retries enabled ofetch calls the request again with the same options, which
 * already carry our fired signal — the second attempt would fail instantly,
 * never reaching the network. Introducing retries means deciding first whether
 * the ceiling applies per attempt or to the whole logical request.
 */

// #region Imports
// Types
import type { IApiRequestTimeoutTarget } from '../types/apiRequest';

// Utils
import { combineAbortSignals, createTimeoutSignal } from './abortSignals';

// Constants
import { BRICKS_API_READ_TIMEOUT_MS, BRICKS_API_WRITE_TIMEOUT_MS } from '../constants/apiTimeouts';
// #endregion

// #region Data
/**
 * Request options only the client gets to set: the hooks and the retry policy.
 * The caller describes the request (method, body, headers, ceiling, signal); the
 * address and the retries are the client's business.
 *
 * They are forbidden because every one of them takes effect AFTER the client has
 * decided the routing and added the installation identity: `onRequest` runs
 * before the URL is built, and the response hooks and a functional `retryDelay`
 * run before a retry — the one a call-level `retry` enables by overriding the
 * instance's `retry: 0`. Their roles differ. The hooks and a functional
 * `retryDelay` receive the context, so they can rewrite `baseURL` or the
 * `request` itself, and the retry goes out with `{ ...context.options }`.
 * `retry` and `retryStatusCodes` rewrite nothing — they merely allow a repeat,
 * and the repeat reuses the already authorized headers. Verified on ofetch
 * 1.5.1: both `onRequest` and the `retry` + `onResponseError` pair delivered
 * installation credentials to a foreign origin.
 *
 * The list is the single source for both of its uses: the options type
 * (`TApiRequestOptions` omits these keys) and the client stripping them at
 * runtime. Two copies would drift apart silently, and a divergence here brings
 * the leak back.
 */
export const CLIENT_OWNED_REQUEST_OPTIONS = [
    'onRequest',
    'onRequestError',
    'onResponse',
    'onResponseError',
    'retry',
    'retryDelay',
    'retryStatusCodes',
] as const;

/**
 * Methods that change nothing on the server. The only such list in the policy:
 * both the ceiling and the text of the abort message depend on it, and two
 * copies of one piece of knowledge would drift apart silently. An unknown method
 * counts as a write: optimistic classification is the more dangerous one.
 */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Locale keys for a request aborted by the timeout ceiling. Reads and writes
 * differ in substance, not in wording: an aborted read can simply be repeated,
 * while an aborted write may already have been applied by the server.
 *
 * The keys live next to the method list: otherwise two domains would pick the
 * text by their own copy of the rule, and the copies would drift apart silently.
 */
const TIMEOUT_MESSAGE_KEYS = {
    read: 'bricks.common.readTimeout',
    write: 'bricks.common.writeTimeout',
} as const;

/**
 * Bound on walking the `cause` chain: ofetch puts the original error into
 * `cause` (`FetchError` → `TimeoutError`), but the chain could in theory be
 * cyclic.
 */
const MAX_ERROR_CAUSE_DEPTH = 5;
// #endregion

// #region Methods
/**
 * Reads an arbitrary value as a record without casting to `any`: both a
 * `Request` object and the DOMException that aborts `AbortSignal.timeout` are
 * needed here for a couple of fields only.
 *
 * @param value - Arbitrary value.
 * @returns Record of fields, or null for non-objects.
 */
function readRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value !== 'object' || value === null) {
        return null;
    }

    return value as Record<string, unknown>;
}

/**
 * Whether the request changes state on the server. A missing method is a GET
 * (ofetch does not fill `options.method` for one), that is, a read.
 *
 * @param method - HTTP method (any case).
 * @returns The request is a write.
 */
export function isApiWriteMethod(method?: string): boolean {
    return Boolean(method) && !READ_METHODS.has(String(method).toUpperCase());
}

/**
 * Returns the locale key for a request aborted by the timeout ceiling.
 * Translating it stays with the caller: a store, a utility and a component each
 * have their own access to i18n.
 *
 * @param method - HTTP method of the aborted request (any case).
 * @returns Locale key of the message.
 */
export function resolveRequestTimeoutMessageKey(method?: string): string {
    return isApiWriteMethod(method) ? TIMEOUT_MESSAGE_KEYS.write : TIMEOUT_MESSAGE_KEYS.read;
}

/**
 * Returns the timeout ceiling for a method.
 *
 * @param method - HTTP method (any case), or undefined — as with an ofetch GET.
 * @returns Ceiling in milliseconds.
 */
export function resolveApiRequestTimeout(method?: string): number {
    return isApiWriteMethod(method) ? BRICKS_API_WRITE_TIMEOUT_MS : BRICKS_API_READ_TIMEOUT_MS;
}

/**
 * Determines the request method. `options.method` is not always filled: a GET
 * has none, and when called with a `Request` object ofetch does not copy the
 * method into the options — then it is read off the request itself.
 *
 * @param request - Request (string, URL or Request).
 * @param method - Method from the request options.
 * @returns Uppercased method, or undefined (equivalent to GET).
 */
export function resolveApiRequestMethod(request: unknown, method?: string): string | undefined {
    if (method) {
        return method.toUpperCase();
    }

    const requestMethod = readRecord(request)?.method;

    return typeof requestMethod === 'string' ? requestMethod.toUpperCase() : undefined;
}

/**
 * Whether a value looks like an `AbortSignal`. A structural check rather than
 * `instanceof`: the signal may arrive from another realm (worker, jsdom), where
 * the constructor is its own.
 *
 * @param value - Arbitrary value.
 * @returns The value can be used as an abort signal.
 */
function isAbortSignalLike(value: unknown): value is AbortSignal {
    const record = readRecord(value);

    if (!record) {
        return false;
    }

    return 'aborted' in record && typeof record.addEventListener === 'function';
}

/**
 * Determines the caller's abort signal. As with the method, ofetch does not copy
 * `signal` from a `Request` object into the options, while a signal passed in the
 * options overrides the request's own one by the rules of fetch — without this
 * fallback the caller's cancellation would stop working until the ceiling ran
 * out.
 *
 * An explicit `options.signal` wins; `null` means refusing to inherit the signal
 * from the `Request` object, not refusing the ceiling — the policy sets the
 * ceiling separately and in any case.
 *
 * @param request - Request (string, URL or Request).
 * @param signal - Signal from the request options.
 * @returns The caller's signal, or undefined/null.
 */
function resolveApiRequestSignal(
    request: unknown,
    signal?: AbortSignal | null
): AbortSignal | null | undefined {
    if (signal !== undefined) {
        return signal;
    }

    const requestSignal = readRecord(request)?.signal;

    return isAbortSignalLike(requestSignal) ? requestSignal : undefined;
}

/**
 * Applies the policy to the request options: picks the ceiling and installs it
 * as a signal.
 *
 * The signal is installed ALWAYS, not only on top of the caller's own. The ofetch
 * `timeout` option covers waiting for the headers only: its timer is cleared in
 * a `finally` around the single `await fetch(...)`, while the body is read later
 * (1.5.1, `shared/ofetch.*.mjs:287-300`) — a server that returned a status and
 * then hung mid-JSON would hold the promise forever, together with
 * `isSubmitting` and an unreachable `finally`. A live signal aborts both phases.
 * The internal ofetch mechanism does not engage at all: it is only built when
 * there is no `signal` (`:261`).
 *
 * `options.timeout` stays filled in as the policy's effective value — a readable
 * declaration of the budget in the options; the actual boundary is held by the
 * signal.
 *
 * The policy treats neither `timeout: 0`, nor a non-numeric value, nor
 * `signal: null` as an opt-out — each of them would be a silent return of the
 * original defect.
 *
 * @param request - Request (string, URL or Request).
 * @param options - Request options; mutated in place.
 * @returns The signal that ended up in the options: by its `reason` the caller
 * tells a fired ceiling from a cancellation (see `normalizeRequestAbortError`).
 */
export function applyApiRequestTimeout(
    request: unknown,
    options: IApiRequestTimeoutTarget
): AbortSignal {
    // A value from the call site is respected, but only an interpretable one:
    // `Infinity` or `NaN` in an override is not "wait longer", it is a lost
    // ceiling
    const timeoutMs =
        typeof options.timeout === 'number' &&
        Number.isFinite(options.timeout) &&
        options.timeout > 0
            ? options.timeout
            : resolveApiRequestTimeout(resolveApiRequestMethod(request, options.method));

    options.timeout = timeoutMs;

    const callerSignal = resolveApiRequestSignal(request, options.signal);
    const timeoutSignal = createTimeoutSignal(timeoutMs);
    const effectiveSignal = callerSignal
        ? combineAbortSignals([callerSignal, timeoutSignal])
        : timeoutSignal;

    options.signal = effectiveSignal;

    return effectiveSignal;
}

/**
 * Recognizes the timeout ceiling firing by the `TimeoutError` name anywhere in
 * the `cause` chain: an abort in the header phase is wrapped by ofetch into a
 * `FetchError`, while an abort during the body read propagates unchanged — body
 * reading in ofetch is not wrapped in try/catch. That is why the whole chain is
 * walked instead of one level being checked.
 *
 * On its own the predicate does not recognize an error from the body phase in a
 * browser — the name there is replaced by the platform; it is
 * `normalizeRequestAbortError` that brings it back to a recognizable shape at
 * the transport boundary.
 *
 * @param error - Request error.
 * @returns The request was aborted by the timeout.
 */
export function isRequestTimeoutError(error: unknown): boolean {
    let current: unknown = error;

    for (let depth = 0; depth < MAX_ERROR_CAUSE_DEPTH; depth += 1) {
        const errorLike = readRecord(current);

        if (!errorLike) {
            return false;
        }

        if (errorLike.name === 'TimeoutError') {
            return true;
        }

        current = errorLike.cause;
    }

    return false;
}

/**
 * Whether the error is a request abort (`AbortError` anywhere in the `cause`
 * chain).
 *
 * @param error - Request error.
 * @returns The request was aborted.
 */
function isRequestAbortError(error: unknown): boolean {
    let current: unknown = error;

    for (let depth = 0; depth < MAX_ERROR_CAUSE_DEPTH; depth += 1) {
        const errorLike = readRecord(current);

        if (!errorLike) {
            return false;
        }

        if (errorLike.name === 'AbortError') {
            return true;
        }

        current = errorLike.cause;
    }

    return false;
}

/**
 * Brings an abort by the ceiling back to a recognizable shape when the platform
 * has lost the reason for the abort.
 *
 * Established by measurement: not every platform preserves the reason, and not
 * in every phase. Node (undici) preserves `signal.reason` whether the abort
 * happens while awaiting the response headers or while reading the body; Chrome
 * preserves it during the header phase only — during a body read it surfaces an
 * `AbortError` ("The user aborted a request") no matter what did the aborting,
 * so our own `TimeoutError` in `reason` is lost exactly as a native one would be.
 * Without this normalization a hung body would look like a user cancellation: a
 * write would not get the truthful unknown-outcome message, and the page list
 * would not trigger reconciliation — even though hanging on the body is the most
 * likely sign that the server has already applied the write.
 *
 * The verdict comes from the signal, not from the error: the `reason` of a
 * combined signal holds the cause of the FIRST abort, so a caller's cancellation
 * stays a cancellation. Treating any `AbortError` as a timeout would not do —
 * a user leaving the page and the overall deadline of a data source run would
 * both become timeouts.
 *
 * @param error - Request error.
 * @param effectiveSignal - Signal installed by `applyApiRequestTimeout`.
 * @returns The original error, or a `TimeoutError` with it in `cause`.
 */
export function normalizeRequestAbortError(error: unknown, effectiveSignal: AbortSignal): unknown {
    if (isRequestTimeoutError(error) || !isRequestAbortError(error)) {
        return error;
    }

    if (!effectiveSignal.aborted || !isRequestTimeoutError(effectiveSignal.reason)) {
        return error;
    }

    const timeoutError = new Error('The request was aborted after reaching the timeout', {
        cause: error,
    });
    timeoutError.name = 'TimeoutError';

    return timeoutError;
}
// #endregion
