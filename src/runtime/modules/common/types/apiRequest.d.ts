/**
 * Types of the builder request policy (`utils/apiRequestPolicy.ts`).
 */

// #region apiRequestPolicy
/**
 * The narrow slice of the request options the timeout policy governs.
 * Structurally compatible with the ofetch `ResolvedFetchOptions`, but it does not pull
 * that type in: the policy is a pure utility and has no obligation to know about the
 * transport.
 */
export interface IApiRequestTimeoutTarget {
    /** HTTP method of the request; for a GET ofetch does not fill it in */
    method?: string;
    /** Waiting ceiling in milliseconds: before the policy it is the call override, after it the effective value */
    timeout?: number;
    /**
     * Cancellation signal. Before the policy is applied it is the caller's signal or
     * `null` (a refusal to inherit the signal off a `Request` object); after it, the
     * signal of the waiting ceiling or its combination with the caller's signal.
     */
    signal?: AbortSignal | null;
}
// #endregion
