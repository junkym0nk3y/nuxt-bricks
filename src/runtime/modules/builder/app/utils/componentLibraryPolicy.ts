/**
 * The policy of loading the component library (pure functions).
 *
 * What lives here is the knowledge of one outcome of the manifest request — "the
 * answer did not arrive within the SSR deadline" — which is handled unlike every
 * other refusal: the result degrades to the layout blocks instead of the load
 * being rejected.
 */

// #region Constants
/**
 * The name of the SSR deadline error of the manifest request. A name of its own
 * rather than `TimeoutError`: by it the load tells its own deadline apart from a
 * request cut off at the transport ceiling and from somebody else's error of the
 * same name. Were the names to coincide, any transport timeout would quietly turn
 * into a degraded library with a client-side retry.
 */
const COMPONENT_MANIFEST_DEADLINE_ERROR_NAME = 'BricksComponentManifestDeadlineError';
// #endregion

/**
 * Creates the SSR deadline error of the component manifest request.
 *
 * @param deadlineMs - Deadline of waiting for the endpoint's answer, ms.
 * @returns An error with a recognizable name.
 */
export function createComponentManifestDeadlineError(deadlineMs: number): Error {
    const error = new Error(
        `Bricks components manifest request exceeded its deadline (${deadlineMs}ms budget)`
    );
    error.name = COMPONENT_MANIFEST_DEADLINE_ERROR_NAME;

    return error;
}

/**
 * Whether the error is the SSR deadline of the component manifest request.
 *
 * @param error - An arbitrary error.
 * @returns This is the deadline of the manifest request.
 */
export function isComponentManifestDeadlineError(error: unknown): boolean {
    return error instanceof Error && error.name === COMPONENT_MANIFEST_DEADLINE_ERROR_NAME;
}
