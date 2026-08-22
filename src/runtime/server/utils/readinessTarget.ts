/**
 * Choosing the persistence path for the readiness probe: a configuration with
 * neither a database nor an adapter means the editorial CRUD effectively answers
 * 500 — readiness then must be 503 rather than green.
 */

/** The persistence path the readiness probe checks */
export type TReadinessTarget = 'adapter' | 'none';

/** Signs of the configured persistence paths */
export interface IReadinessTargetInput {
    /**
     * The build-time factory of external mode is installed (the
     * externalBackendStorage plugin).
     */
    hasExternalBackend: boolean;
    hasDatabaseUrl: boolean;
    hasCustomAdapter: boolean;
}

/**
 * Decides which persistence path has to confirm readiness.
 *
 * `external` goes down the adapter path (checkHealth of the HTTP adapter — a GET
 * to the backend health URL or `GET {base}`); for `builtin` the adapter path
 * requires a database or a custom adapter. PROXY_URL selects no persistence —
 * dev proxying of non-bricks /api/* does not affect the readiness of the
 * editorial API.
 *
 * @param input - Signs of the configuration.
 */
export function resolveReadinessTarget(input: IReadinessTargetInput): TReadinessTarget {
    if (input.hasCustomAdapter || input.hasExternalBackend || input.hasDatabaseUrl) {
        return 'adapter';
    }

    return 'none';
}
