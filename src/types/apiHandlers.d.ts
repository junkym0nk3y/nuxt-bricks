/**
 * One entry of the `/api/bricks/**` Nitro handler manifest
 * (`src/api-handlers.ts`): route, method, file relative to runtimeDir and the
 * public read-model flag.
 */

export interface IBricksApiHandler {
    /** The whole handler path, parameters included (`/api/bricks/:id`) */
    route: string;
    /** HTTP method; without it the handler answers any method */
    method?: 'get' | 'post' | 'put' | 'patch' | 'delete';
    /** Path of the handler file from `runtimeDir`, without the extension */
    file: string;
    /**
     * The handler survives render-only mode: it is registered even with
     * features.builder off, while the handlers without the flag are skipped there.
     *
     * A surface flag, not an auth one: whether a path is open without
     * authentication is decided by the matrix in
     * `server/utils/auth/routeProtection.ts`, and the two do not coincide —
     * `GET /api/bricks/components` is open there without carrying this flag, and
     * the health probes carry it although the live renderer never calls them.
     */
    isPublic?: boolean;
}
