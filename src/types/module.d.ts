/**
 * Options of the Nuxt module (`bricks` in `nuxt.config`) — the contract of
 * `src/module.ts`.
 *
 * Nuxt derives the typing of the `bricks` key from the `defineNuxtModule` generic
 * (`NuxtModule<infer O>`) rather than from the name of this interface, which makes
 * this file the single source of the option shape both for the setup and for the
 * runtimeConfig resolvers.
 */
import type { TBricksBackendMode } from './moduleBackendConfig';
import type { TBricksProjectDeviceSet } from '../runtime/modules/common/types/devices';

export interface IBricksModuleOptions {
    /**
     * The project device set: 2–4 entries sorted by ascending `width`, with
     * `mobile` first and `desktop` last as a requirement.
     *
     * The `width` of a device is at once the sheet width in the builder and the
     * `min-width` of its media-query range on a published page: there is no
     * separate list of thresholds, so gaps and overlaps between the steps cannot
     * happen by construction.
     *
     * The option is build-time and it is the only one: the same resolved map feeds
     * the SCSS map of the mixins (`#bricks-scss`), so the canvas, the containers,
     * the published thresholds and the media queries of brick authors all compute
     * from the same numbers. An invalid value fails the build — the set must never
     * be substituted silently, that would change the layout of every page.
     *
     * An individual page can get a set of its own in the builder; it is stored in
     * `bricks_pages.viewport_config` and overrides the project one for that page
     * alone.
     */
    devices?: TBricksProjectDeviceSet;
    /**
     * Basic Auth protecting the builder, the preview and the mutating APIs.
     * ATTENTION: set values of your own in production (see the README).
     */
    basicAuth?: {
        username?: string;
        password?: string;
    };
    /**
     * Authorization mode of the protected paths (builder, preview, API mutations).
     * - 'basic' (the default) — HTTP Basic Auth with the credential pair from
     *   basicAuth/env.
     * - 'database' — users in Postgres (a scrypt hash), the login page at
     *   `<builderPrefix>/bricks-login`, cookie sessions in the database (the
     *   bricks_users/bricks_sessions tables).
     * ENV override: BRICKS_AUTH_MODE, BRICKS_AUTH_SESSION_MAX_AGE.
     * The first account (`admin` / `bricks-pass`) is created by the migration, the
     * rest by the "Users" section of the builder.
     */
    auth?: {
        mode?: 'basic' | 'database';
        /** Lifetime of a cookie session in seconds (default: 604800 — 7 days) */
        sessionMaxAgeSeconds?: number;
        /**
         * The "Users" section and the `/api/bricks/users/**` handlers (default
         * true).
         *
         * `false` — the section is not shown and the handlers answer **404**
         * rather than 403: a 403 would confirm that account management is present
         * in the build and merely closed. The flag is for installations where
         * accounts are kept outside (LDAP, an external system writing into the
         * database) and editing them from the builder would take the source of
         * truth out of sync. One's own profile does not depend on the flag.
         *
         * In `auth.mode: 'basic'` the handlers are unavailable regardless of the
         * flag: that mode has no accounts at all.
         * ENV override: BRICKS_AUTH_ALLOW_USER_MANAGEMENT.
         */
        allowUserManagement?: boolean;
        /**
         * Password change from the interface (default true) — both one's own in
         * the profile and somebody else's by an administrator.
         *
         * `false` — both handlers answer **403** with the
         * `PASSWORD_CHANGE_DISABLED` code, and the password forms are not shown.
         * A 403 rather than the 404 of the accounts section: the presence of a
         * password in the installation is obvious anyway (it is what people log in
         * with), there is nothing to hide, and the client needs to tell "switched
         * off by configuration" from "no rights". The flag is for installations
         * where passwords are kept outside (LDAP, a single directory) and changing
         * them in the builder would take the source of truth out of sync; in such
         * installations passwords are kept by the external system, and an emergency
         * reset is a write into the database (the recipe is in the README).
         *
         * In `auth.mode: 'basic'` the handlers are unavailable regardless of the
         * flag: that mode has no accounts at all.
         * ENV override: BRICKS_AUTH_ALLOW_PASSWORD_CHANGE.
         */
        allowPasswordChange?: boolean;
    };
    /**
     * Data backend mode: where the data of pages, versions and media metadata
     * lives. Files (S3), sharp and the browser-facing /api/bricks/** are always
     * local.
     * - 'builtin' — the built-in PostgreSQL adapter (see database.url);
     * - 'external' — a consumer HTTP backend following the contract in
     *   docs/external-backend-contract.md (an HTTP implementation of
     *   IStorageAdapter).
     * `mode` is build-time (changing it after a build is unsupported), 'builtin' by
     * default; url/token/healthUrl are runtime-overridable:
     * NUXT_BRICKS_BACKEND_URL / _TOKEN / _HEALTH_URL.
     */
    backend?: {
        mode?: TBricksBackendMode;
        /**
         * The full base prefix of the bricks API on the external server (for
         * example https://api.example.com/my-cms) — the adapter appends relative
         * paths only, no "bricks" segment is hardcoded.
         */
        url?: string;
        /** Readiness URL of the external backend (only a 2xx counts as ready) */
        healthUrl?: string;
    };
    /**
     * PostgreSQL for the default storage adapter (persistence, builtin mode).
     * /api/bricks/** is served by local Nitro handlers in either backend mode and
     * whether or not the url is set; the url decides where those handlers keep the
     * data.
     * Set the connection string through the ENV NUXT_BRICKS_DATABASE_URL —
     * nuxt.config is no place for secrets.
     */
    database?: {
        url?: string;
        /**
         * Server-side execution ceiling of a single SQL statement, ms (default
         * 8000). The database cancels a query that exceeds it by itself — without
         * that a hung query would hold a pool connection until the process dies,
         * and a series of such queries would exhaust the pool. It counts per
         * statement, not per transaction. It cannot be switched off: `0` and other
         * invalid values are read as "not set" and replaced by the default; a
         * legitimately long query is served by a larger value.
         * The limit does not apply to migrations (`bricks-migrate` connects on its
         * own).
         * ENV override: NUXT_BRICKS_DATABASE_STATEMENT_TIMEOUT_MS.
         */
        statementTimeoutMs?: number;
    };
    /**
     * How many versions of a page are kept: a snapshot of the previous state is
     * created on every save that changes `schema` (implemented by the storage
     * adapter). Default 5; `0` turns versioning off.
     * ENV override: NUXT_BRICKS_VERSIONS_LIMIT.
     */
    versionsLimit?: number;
    /**
     * S3-compatible storage for the default publish adapter.
     * ENV override: NUXT_BRICKS_S3_*.
     */
    s3?: {
        endpoint?: string;
        region?: string;
        bucket?: string;
        accessKeyId?: string;
        secretAccessKey?: string;
        /** Managed prefix of the media file keys (default 'bricks-media/') */
        prefix?: string;
        /** Managed prefix of the page thumbnail keys (default 'bricks-thumbnails/') */
        thumbnailsPrefix?: string;
        /**
         * Managed prefix of the profile photo keys (default 'bricks-avatars/').
         *
         * A prefix of its own rather than the media library: otherwise avatars
         * would land in the gallery — exposed to deletion by any editor and to the
         * bucket import as media records.
         */
        avatarsPrefix?: string;
    };
    /**
     * Dev-only proxying of non-bricks /api/* to the backend of the host project
     * (the middleware is registered only when nuxt.options.dev is on;
     * /api/bricks/** is never proxied — see bricks.backend).
     * The address is server-only runtimeConfig (it never reaches the client
     * payload).
     * ENV: PROXY_URL (the build-time fallback), NUXT_BRICKS_PROXY_URL (the runtime
     * override).
     */
    proxy?: {
        url?: string;
    };
    /**
     * The data source policy of a published page (the renderer runs them on every
     * SSR and refresh through a dedicated public client: no cookies, with a
     * timeout; GET/HEAD are the only methods).
     */
    dataSources?: {
        /**
         * The hosts for which absolute http(s) data source URLs are allowed (an
         * exact hostname match, without the protocol and the port).
         * Default: empty — only relative URLs (`/api/...`) are allowed.
         */
        allowedHosts?: string[];
        /** Timeout of a single request, ms (default 10000) */
        timeoutMs?: number;
        /** Maximum of simultaneous requests per page (default 6) */
        concurrency?: number;
        /**
         * Size limit of a single response, bytes (default 1 MB, a JSON-length
         * approximation).
         */
        maxResponseBytes?: number;
        /** Maximum of data source requests per page run (default 24) */
        maxRequestsPerPage?: number;
        /** Total wall-clock budget of a single run, ms (default 15000) */
        totalDeadlineMs?: number;
    };
    /**
     * The media library of the builder.
     */
    media?: {
        /**
         * Hostnames whose absolute URLs are taken for images while an imported schema is
         * being scanned, even when the URL carries no file extension (signed links, image
         * proxies). The match is on the hostname, on a label boundary:
         * `amazonaws.com` covers `bucket.s3.amazonaws.com`.
         *
         * Default: the two usual homes of the module storage
         * (`storage.yandexcloud.net`, `amazonaws.com`). Replace it when the bucket of the
         * installation lives at another provider — otherwise the images of an imported
         * schema are not found, and the re-upload step is skipped in silence. A hostname
         * whose first label is `cdn` is recognized regardless of this list.
         */
        imageHosts?: string[];
    };
    /**
     * Trust the x-forwarded-for header when determining the client IP (the keys of
     * the rate limiters: upload, thumbnail, login). Default false — the socket
     * address alone is used. Turn it on only behind a reverse proxy of your own
     * (exactly one trusted hop; the last element of the header is taken — the one
     * the proxy appended, since the first one the client can forge).
     * ENV override: NUXT_BRICKS_TRUST_PROXY.
     */
    trustProxy?: boolean;
    /**
     * Localization of the builder interface (ru/en).
     * defaultLocale applies only when bricks installs @nuxtjs/i18n itself — which
     * is the required order, so it also holds when the consumer lists the module
     * after nuxt-bricks. A top-level `i18n.defaultLocale` in nuxt.config wins over
     * this option: the bricks defaults are merged under it.
     */
    i18n?: {
        defaultLocale?: 'ru' | 'en';
    };
    /**
     * Prefixes of the module pages (build-time, no env override is supported).
     * Format: a leading `/`, lowercase [a-z0-9-] segments, no trailing slash; the
     * prefixes must not overlap. An invalid configuration fails the build.
     * - builderPrefix — the dashboard at `<prefix>`, the editor at
     *   `<prefix>/:pagename`, the login at `<prefix>/bricks-login`
     *   (default: '/bricks')
     * - previewPrefix — the render preview at `<prefix>/:pagename`
     *   (default: '/bricks-preview')
     *
     * The defaults sit in the `bricks-` namespace deliberately: an occupied prefix
     * takes the matching address away from published pages, so the widely used
     * `/preview` and `/login` are left to the consumer.
     */
    routes?: {
        builderPrefix?: string;
        previewPrefix?: string;
    };
    /**
     * Module surfaces (build-time). The flags are independent, and each describes
     * only its own surface — with both of them `false` neither the live render nor
     * the preview is registered.
     * - builder (default true) — the whole builder UI: the builder, login and
     *   preview pages, the editor plugins, the builder handlers (component
     *   library, media proxy, page thumbnail), the editorial API, i18n and Pinia.
     *   false gives a render-only deployment: the handlers flagged public and the
     *   auth protection of paths remain, and so do the published catch-all routes
     *   as long as publishedPages is on.
     * - publishedPages (default true) — the static catch-all routes of the live
     *   render. false means the module does not intercept application URLs; a
     *   published page is then reachable through the preview, which needs builder
     *   to be on.
     */
    features?: {
        builder?: boolean;
        publishedPages?: boolean;
    };
}
