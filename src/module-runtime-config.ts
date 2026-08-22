/**
 * Build-time filling of the module runtimeConfig (moved out of module.ts — see
 * module-setup.ts for the remaining setup helpers).
 */

import { defu } from 'defu';
import type { IBricksRoutePrefixes } from './runtime/modules/common/utils/bricks/routePaths';
import { resolveBricksBackendConfig } from './module-backend-config';
import type { IBricksModuleOptions } from './types/module';
import type { IBricksBackendResolution } from './types/moduleBackendConfig';
import type { TBricksProjectDeviceSet } from './runtime/modules/common/types/devices';
import { DEFAULT_BRICKS_DEVICES } from './runtime/modules/common/constants/devices';
import { validateDeviceSet } from './runtime/modules/common/utils/bricks/devices';

// #region Helpers
/**
 * Resolves the project device set: the module option on top of the constant.
 *
 * An invalid option fails the build instead of being replaced by the default: the
 * set defines both the canvas widths and the media-query thresholds of every page
 * at once, so a silent substitution would mean the project was built with a
 * layout nobody ordered. The error is seen once, at build time, rather than
 * through layout drifting apart.
 *
 * @param configured - Value of `bricks.devices` from nuxt.config.
 * @returns Project device set.
 * @throws Error — the option is set and does not satisfy the set contract.
 */
export function resolveBricksDevices(
    configured: TBricksProjectDeviceSet | undefined
): TBricksProjectDeviceSet {
    if (!configured) {
        return DEFAULT_BRICKS_DEVICES;
    }

    const validation = validateDeviceSet(configured, 'project');

    if (!validation.ok) {
        throw new Error(`[nuxt-bricks] Invalid bricks.devices: ${validation.errors.join('; ')}`);
    }

    // The validator returns the page fields; it knows nothing of the project-only
    // remBase, and that must not be dropped — so we take the original entries,
    // already recognized as valid
    return configured;
}
/**
 * Logs the resolved data backend mode at module start — the mode alone, without
 * URLs or secrets. When there are errors the mode is not logged: module.ts fails
 * the build right after (fail-fast) and the diagnostics travel in the error text.
 *
 * @param resolution - Result of the backend.mode resolver.
 */
function logBackendResolution(resolution: IBricksBackendResolution): void {
    if (resolution.errors.length === 0) {
        const modeLabel =
            resolution.mode === 'external'
                ? 'external (HTTP storage adapter)'
                : 'builtin (local PostgreSQL adapter)';
        console.info(`[nuxt-bricks] Backend mode: ${modeLabel}`);
    }

    for (const warning of resolution.warnings) {
        console.warn(`[nuxt-bricks] ${warning}`);
    }
}

/**
 * Logs the chosen auth mode at module start.
 *
 * @param mode - Authorization mode ('basic' | 'database').
 * @param hasDatabase - Whether a local database is configured.
 */
function logAuthMode(mode: string, hasDatabase: boolean): void {
    if (mode === 'database') {
        console.info('[nuxt-bricks] Auth: database mode (users/sessions in PostgreSQL)');

        if (!hasDatabase) {
            console.warn(
                '[nuxt-bricks] bricks.auth.mode = "database", but bricks.database.url is not set — protected paths will answer 503'
            );
        }

        return;
    }

    console.info('[nuxt-bricks] Auth: basic mode (HTTP Basic Auth)');
}

/**
 * Fills the runtimeConfig of the persistence layer: PostgreSQL, page versioning,
 * S3 (server-only, no secrets in public).
 *
 * @param runtimeConfig - nuxt.options.runtimeConfig.
 * @param options - Module options from nuxt.config.
 */
function applyBricksPersistenceRuntimeConfig(
    runtimeConfig: Record<string, unknown>,
    options: IBricksModuleOptions
): void {
    runtimeConfig.bricksDatabaseUrl =
        runtimeConfig.bricksDatabaseUrl ??
        process.env.NUXT_BRICKS_DATABASE_URL ??
        options.database?.url ??
        '';

    // Server-side execution limit of a single statement: it frees the pool
    // connection, which a client-side wait ceiling cannot do. The key name gives
    // a runtime override without a rebuild through
    // NUXT_BRICKS_DATABASE_STATEMENT_TIMEOUT_MS
    runtimeConfig.bricksDatabaseStatementTimeoutMs =
        runtimeConfig.bricksDatabaseStatementTimeoutMs ??
        process.env.NUXT_BRICKS_DATABASE_STATEMENT_TIMEOUT_MS ??
        options.database?.statementTimeoutMs;

    // Page versioning: the depth of the snapshot history (0 turns it off). The
    // key name gives a runtime override in production without a rebuild through
    // NUXT_BRICKS_VERSIONS_LIMIT.
    runtimeConfig.bricksVersionsLimit =
        runtimeConfig.bricksVersionsLimit ??
        process.env.NUXT_BRICKS_VERSIONS_LIMIT ??
        options.versionsLimit;

    // Secrets and the bucket arrive through NUXT_BRICKS_S3_* (the Nitro runtime
    // override) or through options.s3 — there are no build-time env fallbacks
    runtimeConfig.bricksS3 = defu(runtimeConfig.bricksS3 as object | undefined, options.s3, {
        endpoint: 'https://storage.yandexcloud.net',
        region: 'ru-central1',
        bucket: '',
        accessKeyId: '',
        secretAccessKey: '',
        prefix: 'bricks-media/',
        thumbnailsPrefix: 'bricks-thumbnails/',
        avatarsPrefix: 'bricks-avatars/',
    });
}

/**
 * Fills the runtimeConfig of the external data backend: base URL, Bearer token
 * and health URL (all server-only, none of them reaches the client payload; the
 * browser goes through the local /api/bricks). The `mode` itself is build-time
 * (resolved separately, see applyBricksRuntimeConfig), while the URL and the
 * token are runtime-overridable through the Nuxt convention
 * NUXT_BRICKS_BACKEND_URL / _TOKEN / _HEALTH_URL.
 *
 * @param runtimeConfig - nuxt.options.runtimeConfig.
 * @param options - Module options from nuxt.config.
 */
function applyBricksBackendRuntimeConfig(
    runtimeConfig: Record<string, unknown>,
    options: IBricksModuleOptions
): void {
    runtimeConfig.bricksBackendUrl =
        runtimeConfig.bricksBackendUrl ??
        process.env.NUXT_BRICKS_BACKEND_URL ??
        options.backend?.url ??
        '';
    // The token comes from env only: nuxt.config is no place for secrets
    runtimeConfig.bricksBackendToken =
        runtimeConfig.bricksBackendToken ?? process.env.NUXT_BRICKS_BACKEND_TOKEN ?? '';
    runtimeConfig.bricksBackendHealthUrl =
        runtimeConfig.bricksBackendHealthUrl ??
        process.env.NUXT_BRICKS_BACKEND_HEALTH_URL ??
        options.backend?.healthUrl ??
        '';
}

/**
 * Fills the runtimeConfig of the dev proxying of non-bricks /api/* (PROXY_URL).
 * The key is server-only: the backend address never shows up in the client
 * payload, the client goes through the proxy middleware. Runtime override:
 * NUXT_BRICKS_PROXY_URL.
 *
 * @param runtimeConfig - nuxt.options.runtimeConfig.
 * @param options - Module options from nuxt.config.
 */
function applyBricksProxyRuntimeConfig(
    runtimeConfig: Record<string, unknown>,
    options: IBricksModuleOptions
): void {
    runtimeConfig.bricksProxyUrl =
        runtimeConfig.bricksProxyUrl ?? options.proxy?.url ?? process.env.PROXY_URL ?? '';
}

/**
 * Drops an empty string out of the chain of value sources.
 *
 * Flags whose default is "on" need this: `??` treats `''` as a value that was
 * set, while boolean flag parsing reads an empty string as `false`, so an env
 * variable declared without a value would silently switch a feature off instead
 * of letting it fall back to its default. Flags defaulting to `false` do not care
 * either way, but a rule is cheaper than an exception.
 *
 * @param value - Value from runtimeConfig, env or the module options.
 * @returns The value itself, or `undefined` when it is empty.
 */
function readDefinedFlag(value: unknown): unknown {
    if (typeof value === 'string' && value.trim() === '') {
        return undefined;
    }

    return value;
}

/**
 * Fills the runtimeConfig of the auth mode: the server keys plus the public flag
 * for the 401 interceptor and the login page.
 * A runtime subtlety: NUXT_BRICKS_AUTH_MODE overrides the server key only; the
 * client also needs NUXT_PUBLIC_BRICKS_AUTH_MODE.
 *
 * @param runtimeConfig - nuxt.options.runtimeConfig.
 * @param publicConfig - runtimeConfig.public.
 * @param options - Module options from nuxt.config.
 */
function applyBricksAuthRuntimeConfig(
    runtimeConfig: Record<string, unknown>,
    publicConfig: Record<string, unknown>,
    options: IBricksModuleOptions
): void {
    runtimeConfig.bricksAuthMode =
        runtimeConfig.bricksAuthMode ?? process.env.BRICKS_AUTH_MODE ?? options.auth?.mode;
    runtimeConfig.bricksAuthSessionMaxAge =
        runtimeConfig.bricksAuthSessionMaxAge ??
        process.env.BRICKS_AUTH_SESSION_MAX_AGE ??
        options.auth?.sessionMaxAgeSeconds;

    // User management is on by default: the value is written as an explicit
    // boolean rather than left empty — otherwise
    // `NUXT_BRICKS_AUTH_ALLOW_USER_MANAGEMENT=false` would have no type for Nitro
    // to coerce the env string to. An empty string counts as a value that was not
    // set: `??` would pass it on as if it were, while flag parsing reads it as
    // `false` — so a variable declared without a value in .env or compose would
    // switch the whole accounts section off, the administrator included, against a
    // documented default of "on"
    runtimeConfig.bricksAuthAllowUserManagement =
        readDefinedFlag(runtimeConfig.bricksAuthAllowUserManagement) ??
        readDefinedFlag(process.env.BRICKS_AUTH_ALLOW_USER_MANAGEMENT) ??
        options.auth?.allowUserManagement ??
        true;

    // Password change is on by default — the same chain and the same reason to
    // drop an empty string: a variable declared without a value must not take
    // away people's ability to change their own password
    runtimeConfig.bricksAuthAllowPasswordChange =
        readDefinedFlag(runtimeConfig.bricksAuthAllowPasswordChange) ??
        readDefinedFlag(process.env.BRICKS_AUTH_ALLOW_PASSWORD_CHANGE) ??
        options.auth?.allowPasswordChange ??
        true;

    // Public flag of the auth mode (not a secret) — the client needs it to
    // redirect to the login page
    publicConfig.bricksAuthMode = publicConfig.bricksAuthMode ?? runtimeConfig.bricksAuthMode;

    // Public flag of user management: the builder and the dashboard decide by it
    // whether to show the section. Hiding it in the UI is a convenience, not a
    // protection: with the flag off the handlers answer 404 by themselves
    publicConfig.bricksAuthAllowUserManagement =
        readDefinedFlag(publicConfig.bricksAuthAllowUserManagement) ??
        runtimeConfig.bricksAuthAllowUserManagement;

    // Public flag of password change: the profile decides by it whether to show
    // the password tab, and a row of the accounts list whether to show the "key"
    // that changes somebody else's. A convenience as well: with the flag off the
    // handlers answer 403 by themselves
    publicConfig.bricksAuthAllowPasswordChange =
        readDefinedFlag(publicConfig.bricksAuthAllowPasswordChange) ??
        runtimeConfig.bricksAuthAllowPasswordChange;
}
// #endregion

/**
 * Fills the module runtimeConfig: basic auth, persistence (Postgres/S3), the
 * external backend, the dev proxy, the route prefixes and the data source policy.
 * The defaults are overridable in production through ENV (NUXT_BRICKS_*), except
 * for bricksRoutes — page paths are fixed at build time (an env override would
 * drift apart from the routes). The backend mode is NOT stored in runtimeConfig at
 * all: such a key would be overridable by NUXT_BRICKS_BACKEND_MODE, bypassing the
 * build-time validation — what carries the mode is the registration of the
 * externalBackendStorage Nitro plugin in module.ts.
 *
 * @param runtimeConfig - nuxt.options.runtimeConfig.
 * @param options - Module options from nuxt.config.
 * @param routePrefixes - Validated route prefixes.
 * @param arePublishedPagesEnabled - Whether the live render of published pages is
 *   registered.
 * @returns Result of the backend.mode resolver — module.ts fails the build on
 *   errors.
 */
export function applyBricksRuntimeConfig(
    runtimeConfig: Record<string, unknown>,
    options: IBricksModuleOptions,
    routePrefixes: IBricksRoutePrefixes,
    arePublishedPagesEnabled: boolean
): IBricksBackendResolution {
    runtimeConfig.basicAuthUsername =
        runtimeConfig.basicAuthUsername ??
        process.env.BASIC_AUTH_USERNAME ??
        options.basicAuth?.username;
    runtimeConfig.basicAuthPassword =
        runtimeConfig.basicAuthPassword ??
        process.env.BASIC_AUTH_PASSWORD ??
        options.basicAuth?.password;

    applyBricksPersistenceRuntimeConfig(runtimeConfig, options);
    applyBricksBackendRuntimeConfig(runtimeConfig, options);
    applyBricksProxyRuntimeConfig(runtimeConfig, options);

    // Trust in x-forwarded-for when determining the client IP for the rate
    // limiters (server-only; the key name gives a runtime override without a
    // rebuild through NUXT_BRICKS_TRUST_PROXY)
    runtimeConfig.bricksTrustProxy =
        runtimeConfig.bricksTrustProxy ??
        process.env.NUXT_BRICKS_TRUST_PROXY ??
        options.trustProxy ??
        false;

    const publicConfig = (runtimeConfig.public ?? {}) as Record<string, unknown>;
    runtimeConfig.public = publicConfig;

    // The single source of prefixes for the client and the auth matrix
    // (build-time)
    publicConfig.bricksRoutes = routePrefixes;

    // The project device set. Public and build-time: the same numbers feed the
    // SCSS map of the mixins, and an env override would take the runtime apart
    // from the already built CSS
    publicConfig.bricksDevices = resolveBricksDevices(options.devices);

    // Whether the live render of published pages is registered. Public because
    // the address-taken check depends on it: with the live render off a page has
    // no URL of its own and there is nothing to reserve — otherwise the client and
    // the server would take different decisions about one and the same name
    publicConfig.bricksPublishedPages = arePublishedPagesEnabled;

    // The data source policy (public: the renderer runs them on the client too —
    // preview and refresh; there are no secrets). The defaults of the numeric
    // values live in render/utils/dataSourcePolicy.ts (the composable substitutes
    // them itself).
    publicConfig.bricksDataSources = defu(
        publicConfig.bricksDataSources as object | undefined,
        options.dataSources,
        { allowedHosts: [] }
    );

    applyBricksAuthRuntimeConfig(runtimeConfig, publicConfig, options);

    // The data backend mode is build-time: resolved from the merged options+env;
    // it is NOT written into runtimeConfig (see the JSDoc above) — module.ts turns
    // the resolution into the registration of Nitro plugins
    const backendResolution = resolveBricksBackendConfig({
        configuredMode: options.backend?.mode,
        backendUrl: runtimeConfig.bricksBackendUrl as string,
        databaseUrl: runtimeConfig.bricksDatabaseUrl as string,
        authMode: runtimeConfig.bricksAuthMode as string,
    });

    logBackendResolution(backendResolution);
    logAuthMode(runtimeConfig.bricksAuthMode as string, Boolean(runtimeConfig.bricksDatabaseUrl));

    return backendResolution;
}
