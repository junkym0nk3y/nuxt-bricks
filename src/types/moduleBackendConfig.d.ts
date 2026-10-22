/**
 * Contract of the data backend mode resolver (`src/module-backend-config.ts`):
 * the input (options + env) and the result with its diagnostics.
 */

export type TBricksBackendMode = 'builtin' | 'external';

export interface IBricksBackendResolutionInput {
    /** Explicit bricks.backend.mode from nuxt.config (build-time, default 'builtin') */
    configuredMode?: TBricksBackendMode;
    /** Resolved base URL of the external backend (options/env) */
    backendUrl: string;
    /** Resolved PostgreSQL URL (options/env) */
    databaseUrl: string;
    /** Authorization mode ('basic' | 'database') */
    authMode: string;
}

export interface IBricksBackendResolution {
    /** The resulting mode: on fatal errors it is never applied — the build fails */
    mode: TBricksBackendMode;
    /** Warnings (the configuration is suspicious, but the build goes on) */
    warnings: string[];
    /** Fatal configuration errors — they fail the build (fail-fast) */
    errors: string[];
}
