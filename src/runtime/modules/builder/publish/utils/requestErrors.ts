import type { Composer } from 'vue-i18n';
import { useNuxtApp } from '#imports';
import { PAGE_CONFLICT_CODES } from '../../../common/constants/publish';
import { BRICKS_STATEMENT_TIMEOUT_MESSAGE_KEY } from '../../../common/constants/apiErrors';
import type { TRequestErrorLike } from '../../../common/types/bricks-api';
import {
    isRequestTimeoutError,
    resolveRequestTimeoutMessageKey,
} from '../../../common/utils/apiRequestPolicy';
import { isStatementTimeoutError } from '../../../common/utils/main';

/**
 * An API request error carrying the HTTP status and the machine-readable conflict
 * code (`data.code` of the response) — by them the callers tell the 409 conflicts
 * apart (an occupied pagename, a revision mismatch) without parsing the text of
 * the message.
 *
 * The original error is kept in `cause`: by it the callers tell an abort by the
 * timeout from a refusal of the server (`isRequestTimeoutError` walks the chain),
 * and without passing it through the wrapper would destroy that classification.
 */
export class RequestError extends Error {
    readonly statusCode?: number;
    readonly conflictCode?: string;

    constructor(message: string, statusCode?: number, conflictCode?: string, cause?: unknown) {
        super(message, { cause });
        this.name = 'RequestError';
        this.statusCode = statusCode;
        this.conflictCode = conflictCode;
    }
}

/**
 * Whether the error is an optimistic locking conflict (the page changed after the
 * expectedRevision passed by the client had been read). Understands both shapes:
 * a RequestError (the wrapper of toRequestError) and a raw ofetch error — the
 * latter toRequestError returns as is, its message already containing "/api/".
 */
export function isRevisionConflictError(error: unknown): boolean {
    if (error instanceof RequestError) {
        return error.conflictCode === PAGE_CONFLICT_CODES.revision;
    }

    return extractConflictCode((error ?? {}) as TRequestErrorLike) === PAGE_CONFLICT_CODES.revision;
}

/**
 * Translates a key through the global i18n. `$i18n` is resolved lazily: these
 * utilities are called outside a setup context, and the fallback covers a Nuxt app
 * with no i18n plugin registered. It does not cover the absence of a Nuxt context
 * altogether — `useNuxtApp()` throws there, and in the units the call goes through
 * only because `#imports` is stubbed.
 */
function translate(key: string, fallback?: string): string {
    const i18n = useNuxtApp().$i18n as Composer | undefined;
    return i18n ? i18n.t(key) : (fallback ?? key);
}

/**
 * Returns the localized "unknown error" message.
 */
function unknownErrorMessage(): string {
    return translate('bricks.common.unknownError', 'Неизвестная ошибка');
}

/**
 * Returns the localized text of an abort by the timeout; the choice of the key is
 * left to the request policy, so that the rule "a read is repeatable, a write may
 * have been applied" lives in one place for every domain.
 *
 * @param method - HTTP method of the aborted request.
 * @returns The message for the user.
 */
function timeoutMessage(method: string): string {
    // No fallback string: there is no point in duplicating the locale text in
    // the code, and outside a Nuxt context (units) `translate` returns the key
    // itself — same as for the revision conflict
    return translate(resolveRequestTimeoutMessageKey(method));
}

/**
 * Takes the revision of a page out of the summary in the local list for the
 * precondition; throws a readable error when the page or the revision is not
 * found.
 *
 * The server allows a PATCH with no precondition (see
 * `IUpdatePagePayload.expectedRevision`), and two writes do go out that way — the
 * publication toggle and the thumbnail. Used by the version rollback and by the
 * schema import from the page list: both overwrite the content of the page whole,
 * so both are obliged to always carry a revision, and there is no silent
 * degradation here.
 *
 * @param page - Page summary from the local list (or undefined).
 * @param fallbackMessage - Localized error message.
 * @returns The revision of the page.
 */
export function requirePageRevision(
    page: { revision?: number } | undefined,
    fallbackMessage: string
): number {
    if (page?.revision === undefined) {
        throw new Error(fallbackMessage);
    }

    return page.revision;
}

/**
 * The waiting limit for the list refresh before the revision conflict is shown.
 * Five seconds: a normal refresh makes it in time, while a hung request does not
 * turn the conflict into an endless spinner.
 *
 * This is a UX deadline, not a transport ceiling, and it is deliberately half of
 * the read ceiling: the conflict has to be shown before the request itself is
 * aborted.
 */
const PAGE_CONFLICT_REFRESH_TIMEOUT_MS = 5000;

/**
 * Waits for the list refresh before the conflict is shown, but no longer than the
 * deadline.
 *
 * The answer itself matters here — with it the retry goes out with a fresh
 * revision — so unlike the refresh after a creation (`currentPageWrite`) the
 * request is not simply let go. But waiting for it up to the transport
 * ceiling is not allowed either: the `finally` closing the write operation does
 * not run before the return from here, that is, a slow GET would keep the save
 * button blocked and forbid the next attempt — the very one the list is being
 * refreshed for. A refusal is swallowed for the same reason as before: the
 * conflict is shown in any case.
 *
 * The trade-off once the deadline expires: the conflict is shown with the stale
 * revision, and an immediate retry may get a second 409. The request itself keeps
 * flying meanwhile and will refresh the list later — and a late answer no longer
 * overwrites the local records, the `pagesRequestId` counter cuts it off.
 *
 * @param refreshPages - Callback refreshing the page list.
 */
async function refreshPagesWithinDeadline(refreshPages: () => Promise<void>): Promise<void> {
    let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
    const deadline = new Promise<void>((resolve) => {
        deadlineTimer = setTimeout(resolve, PAGE_CONFLICT_REFRESH_TIMEOUT_MS);
    });

    try {
        await Promise.race([refreshPages(), deadline]);
    } catch {
        // best-effort: the list could not be refreshed — the conflict is shown anyway
    } finally {
        if (deadlineTimer !== null) {
            clearTimeout(deadlineTimer);
        }
    }
}

/**
 * Starts the list refresh and lets it go: the caller needs the fact of the start
 * rather than the result — and the result guarantees nothing here, the request is
 * able to outrun an unfinished server-side write. The refusal is swallowed right
 * here, otherwise the rejection would end up in an unhandled promise.
 *
 * @param refreshPages - Callback refreshing the page list.
 */
function refreshPagesDetached(refreshPages: () => Promise<void>): void {
    // No `void` here — the `no-void` rule of oxlint
    refreshPages().catch((error: unknown) => {
        console.warn('[Publish Store] Pages refresh after write timeout failed:', error);
    });
}

/**
 * Brings a page write error into the shape shown to a person: an optimistic
 * locking conflict turns into a localized message, and before that the page list
 * is refreshed (fresh revisions) — so a repeated save goes out with an up-to-date
 * precondition and knowingly overwrites somebody else's changes. The refresh is
 * bounded by a deadline, see `refreshPagesWithinDeadline`. An abort by the timeout
 * is a branch of its own: there the refresh is let go without being waited for.
 * The remaining errors are returned as they are.
 *
 * @param error - The original request error.
 * @param refreshPages - Callback refreshing the page list.
 * @returns The error to show to the user.
 */
export async function toPageWriteError(
    error: unknown,
    refreshPages: () => Promise<void>
): Promise<Error> {
    // A write aborted by the timeout leaves the outcome unknown, so the list is
    // refreshed: this is the only attempt to see whether the operation was
    // applied — not a proof of it. The GET goes out immediately and may outrun a
    // still running server-side handler, returning the previous list; finding
    // the outcome out for certain would take an idempotency key, that is, an
    // extension of the server contract. The result of the refresh is not part of
    // the refusal and must not be waited for: the message about the outcome has
    // to arrive at once rather than through one more read ceiling
    if (isRequestTimeoutError(error)) {
        refreshPagesDetached(refreshPages);

        return error instanceof Error ? error : new Error(String(error));
    }

    if (!isRevisionConflictError(error)) {
        return error instanceof Error ? error : new Error(String(error));
    }

    await refreshPagesWithinDeadline(refreshPages);

    return new Error(translate('bricks.publish.toasts.revisionConflict'));
}

/**
 * Takes the machine-readable conflict code out of an ofetch error: h3 serializes
 * `createError({ data })` into the response body, ofetch puts the body into
 * `error.data` — so our code ends up at `error.data.data.code`.
 *
 * @param payload - Request error.
 * @returns The conflict code, or undefined.
 */
function extractConflictCode(payload: TRequestErrorLike): string | undefined {
    const nested = (payload.data as { data?: { code?: unknown } } | undefined)?.data?.code;
    const value = nested ?? payload.data?.code;

    return typeof value === 'string' ? value : undefined;
}

/**
 * Takes the HTTP status out of an ofetch error (the statusCode of the error
 * itself, or the one of the response body).
 *
 * @param payload - Request error.
 * @returns The numeric status, or undefined.
 */
function extractStatusCode(payload: TRequestErrorLike): number | undefined {
    const value = payload.statusCode ?? payload.data?.statusCode;

    return typeof value === 'number' ? value : undefined;
}

/**
 * Formats a request error into a human-readable message.
 *
 * @param method - HTTP method.
 * @param url - Request URL.
 * @param error - The original error.
 */
function formatRequestError(method: string, url: string, error: unknown): string {
    const payload = (error ?? {}) as TRequestErrorLike;
    const message =
        payload.data?.message ||
        payload.message ||
        (error instanceof Error ? error.message : unknownErrorMessage());
    const code = payload.data?.code || payload.code || payload.statusCode;
    const codePart = code ? ` (code: ${String(code)})` : '';

    return `${method} ${url}: ${message}${codePart}`;
}

/**
 * Brings an arbitrary error to a RequestError with a readable text, keeping the
 * HTTP status and the conflict code.
 *
 * @param method - HTTP method.
 * @param url - Request URL.
 * @param error - The original error.
 */
export function toRequestError(method: string, url: string, error: unknown): Error {
    // This check comes first on purpose: the message of a `FetchError` contains
    // the URL, that is, the "/api/" substring, and the early return below would
    // let the timeout out carrying the transport text instead of an honest
    // explanation
    if (isRequestTimeoutError(error)) {
        return new RequestError(timeoutMessage(method), undefined, undefined, error);
    }

    // A request stopped by the server-side time limit — above the transport
    // passthrough for the same reason. The text is its own: unlike an abort by
    // the waiting ceiling, the outcome here is settled, the unfinished write is
    // rolled back
    if (isStatementTimeoutError(error)) {
        return new RequestError(
            translate(BRICKS_STATEMENT_TIMEOUT_MESSAGE_KEY),
            extractStatusCode((error ?? {}) as TRequestErrorLike),
            undefined,
            error
        );
    }

    if (error instanceof RequestError) {
        return error;
    }

    if (error instanceof Error && error.message.includes('/api/')) {
        return error;
    }

    const payload = (error ?? {}) as TRequestErrorLike;

    return new RequestError(
        formatRequestError(method, url, error),
        extractStatusCode(payload),
        extractConflictCode(payload),
        error
    );
}
