/**
 * Pure resolver of the data backend mode (`bricks.backend.mode`): options + env →
 * the resolved mode plus diagnostics. Free of Nuxt dependencies — covered by
 * unit tests (test/module/backendConfig.spec.ts).
 *
 * The model:
 * - the backend choice concerns data only (pages, versions, media metadata);
 *   files (S3), sharp and the browser-facing `/api/bricks/**` are always local;
 * - `builtin` (the default) is the built-in PostgreSQL adapter; `external` is an
 *   HTTP implementation of IStorageAdapter over the consumer backend (the
 *   contract is in docs/external-backend-contract.md);
 * - PROXY_URL takes no part in the persistence choice: it is the dev-only
 *   proxying of non-bricks `/api/*` (see server/middleware/devProxy.ts).
 */
import type {
    IBricksBackendResolution,
    IBricksBackendResolutionInput,
} from './types/moduleBackendConfig';

// #region Helpers
/**
 * Diagnostics of `mode: 'external'`: database auth is incompatible (a build
 * error), database.url is ignored (a warning), a missing url is a warning (the
 * env value can arrive at deploy time through NUXT_BRICKS_BACKEND_URL).
 */
function resolveExternalMode(input: IBricksBackendResolutionInput): IBricksBackendResolution {
    const resolution: IBricksBackendResolution = {
        mode: 'external',
        warnings: [],
        errors: [],
    };

    if (input.authMode === 'database') {
        resolution.errors.push(
            'bricks.auth.mode = "database" is incompatible with bricks.backend.mode = "external": ' +
                'the users and sessions of database auth live in the local PostgreSQL. ' +
                'Use auth.mode = "basic" or backend.mode = "builtin".'
        );
    }

    if (input.databaseUrl) {
        resolution.warnings.push(
            'bricks.backend.mode = "external": database.url is ignored ' +
                '(page and media data go to the external backend). ' +
                'Remove database.url or switch to backend.mode = "builtin".'
        );
    }

    if (!input.backendUrl) {
        resolution.warnings.push(
            'bricks.backend.mode = "external", but backend.url is not set — set it ' +
                'in nuxt.config or through NUXT_BRICKS_BACKEND_URL before the server starts, ' +
                'otherwise /api/bricks/** will answer with an error.'
        );
    }

    return resolution;
}

/**
 * Diagnostics of `mode: 'builtin'` (the default one included): backend.url is
 * ignored (a warning); without database.url the editorial API answers with an
 * error — still a warning, not an error (the URL can arrive at deploy time
 * through NUXT_BRICKS_DATABASE_URL, or the consumer registers a custom adapter).
 */
function resolveBuiltinMode(input: IBricksBackendResolutionInput): IBricksBackendResolution {
    const resolution: IBricksBackendResolution = {
        mode: 'builtin',
        warnings: [],
        errors: [],
    };

    if (input.backendUrl) {
        resolution.warnings.push(
            'bricks.backend.mode = "builtin": backend.url is ignored. ' +
                'Remove backend.url or switch to backend.mode = "external".'
        );
    }

    if (!input.databaseUrl) {
        resolution.warnings.push(
            'bricks.backend.mode = "builtin", but database.url is not set — without ' +
                'NUXT_BRICKS_DATABASE_URL (or a custom storage adapter) ' +
                '/api/bricks/** will answer with an error.'
        );
    }

    return resolution;
}
// #endregion

/**
 * Resolves the data backend mode from the configuration option (builtin by
 * default). Entries in `errors` must fail the build (fail-fast in module.ts); the
 * resolver itself never throws — the caller decides how to surface the
 * diagnostics.
 *
 * @param input - Merged options+env values (see module-runtime-config.ts).
 * @returns The resolved mode plus warnings/errors.
 */
export function resolveBricksBackendConfig(
    input: IBricksBackendResolutionInput
): IBricksBackendResolution {
    if (input.configuredMode === 'external') {
        return resolveExternalMode(input);
    }

    return resolveBuiltinMode(input);
}
