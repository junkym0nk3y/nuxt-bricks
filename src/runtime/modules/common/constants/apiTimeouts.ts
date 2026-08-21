/**
 * Waiting ceilings of the project's API requests: the builder, the public page
 * lookup and the external SSR deadlines around them all take their values from
 * here.
 *
 * A hang is a class of failure of its own: `catch`/`finally` are unreachable
 * under it, so the shared flags (`isSubmitting`, `isSaving`, `isRestoring`) stay
 * raised and survive the user navigating to another page. The error handling is
 * written against a failure and does not help against a hang at all, which means
 * the ceiling belongs to the transport rather than to every single operation.
 *
 * The default is chosen by the HTTP method (`utils/apiRequestPolicy.ts`), while
 * operations with a legitimately different duration override it at the call site
 * — the knowledge of how long taking a preview snapshot or uploading a video
 * normally takes lives next to the call, not in the shared policy.
 *
 * Every request ceiling below bounds the WHOLE exchange, the reading of the
 * response body included: the policy sets it with a live signal rather than with
 * the ofetch `timeout` option, whose timer is cleared right after the headers.
 * The exception is `BRICKS_SSR_DEADLINE_MARGIN_MS` at the end of the file: it is
 * not a request ceiling and the policy does not apply it.
 */

/**
 * Reads: the page list, a page, versions, the component manifest, the media
 * library. The public lookup of a published page (`usePublicPageClient`) takes
 * the same one — it deliberately has no copy of this number: the external SSR
 * deadline around that very call is computed from this constant, and once they
 * drifted apart they would start cutting each other short.
 *
 * Two clients keep a value of their own, and that is not duplication: the ceiling
 * of the data sources (`DEFAULT_DATA_SOURCE_TIMEOUT_MS`) and the ceiling of the
 * external backend (`DEFAULT_BACKEND_TIMEOUT_MS` of the server-side `httpClient`)
 * are configured by the deployment, that is, they are separate budgets that merely
 * coincide by default.
 */
export const BRICKS_API_READ_TIMEOUT_MS = 10_000;

/**
 * Writes: creation, update, PATCH, deletion, version rollback. The ceiling is
 * more generous than for reads because an aborted write leaves the client in
 * uncertainty (the server may have applied it) — a trade-off in favor of "let the
 * server finish speaking".
 */
export const BRICKS_API_WRITE_TIMEOUT_MS = 30_000;

/**
 * Login/logout: a short write that has no use for the shared 30 seconds — the
 * login form has to release its button quickly.
 */
export const BRICKS_AUTH_REQUEST_TIMEOUT_MS = 10_000;

/**
 * Proxying of a cross-origin resource for the canvas snapshot: semantically a
 * read performed with a POST. Slightly above the endpoint's own ceiling
 * (`PROXY_FETCH_TIMEOUT_MS`, 10 s), so that its error is what reaches the caller
 * rather than our abort.
 */
export const BRICKS_S3_PROXY_TIMEOUT_MS = 15_000;

/**
 * Upload of the preview snapshot: the canvas JPEG plus the server-side
 * recompression into webp and the upload to S3.
 */
export const BRICKS_THUMBNAIL_UPLOAD_TIMEOUT_MS = 60_000;

/**
 * Upload of a file into the media library: the server accepts videos up to 100 MB
 * (`DEFAULT_MEDIA_MAX_VIDEO_UPLOAD_SIZE_MB`), so the ceiling here is about a slow
 * connection rather than about a hung server.
 */
export const BRICKS_MEDIA_UPLOAD_TIMEOUT_MS = 300_000;

/**
 * Margin of the external SSR deadline over the operation's own mechanism.
 *
 * The external deadline (`withPromiseDeadline` around the operation) insures
 * against exactly one case: on SSR relative URLs go out as an internal Nitro
 * call, which does not listen to an `AbortSignal`, so neither the transport
 * ceiling nor the operation's own `AbortController` will abort it. It has to fire
 * LATER than the internal mechanism: equal values would take the operation's
 * regular degradation away (data sources return whatever managed to arrive) and
 * turn it into a failure of the whole thing.
 *
 * It goes around the operation specifically, not outside through
 * `useAsyncData({ timeout })`: the external variant rejects the whole handler,
 * that is, throws away what had already arrived — both SSR sites have tripped over
 * that already.
 */
export const BRICKS_SSR_DEADLINE_MARGIN_MS = 2_000;
