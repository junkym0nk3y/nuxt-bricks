/**
 * Auth middleware protecting the builder, the preview and the mutating API.
 * The mode is `bricks.auth.mode` ('basic' | 'database', env BRICKS_AUTH_MODE).
 *
 * Protects (page prefixes come from `bricks.routes`, defaults /bricks and
 * /bricks-preview; the matrices work with the logical path — it is supplied by
 * `event.path`, from which h3 has already cut the middleware mount prefix, that
 * is `app.baseURL`):
 * - <builderPrefix>/** — page manager and landing editor
 * - <previewPrefix>/** — preview render mode
 * - /api/bricks/** — the entire editorial API, GET included (drafts, full
 *   schema, media library, versions), media proxy and page thumbnail
 *
 * Does NOT protect:
 * - dynamic human-readable routes of published pages
 * - GET/HEAD /api/bricks/public/** — public read model for the renderer
 * - GET/HEAD /api/bricks/components — component library (a public manifest:
 *   the contents of the library and its editorial metadata)
 * - in database mode: the login page and /api/bricks/auth/** (otherwise there
 *   is no way to sign in)
 *
 * Basic mode — HTTP Basic Auth, configured through ENV:
 * - BASIC_AUTH_USERNAME (default: admin)
 * - BASIC_AUTH_PASSWORD (default: change-me — for dev only; in production the
 *   default password makes protected paths answer 503)
 * - invalid credentials (the header is present) share the per-IP rate limit
 *   with the database login: 30 failures in 15 minutes → 429
 *
 * Database mode — cookie sessions in Postgres: an invalid session on an HTML
 * path redirects to the login page (`getBuilderLoginPath`), on the API it is
 * 401 without WWW-Authenticate.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import {
    defineEventHandler,
    getHeader,
    setResponseHeader,
    sendRedirect,
    createError,
    type H3Event,
} from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';
import { requiresAuth, isProtectedHtmlPath } from '../utils/auth/routeProtection';
import { assertCsrfSafe, isCsrfProtectedPath } from '../utils/auth/csrfProtection';
import {
    DEFAULT_BRICKS_ROUTE_PREFIXES,
    getBuilderLoginPath,
    joinPathBase,
    normalizePathTrailingSlash,
    type IBricksRoutePrefixes,
} from '../../modules/common/utils/bricks/routePaths';
import { resolveSessionUser } from '../utils/auth/session';
import {
    clearSessionCookie,
    getSessionTokenFromCookie,
    hashSessionToken,
    resolveSessionMaxAgeSeconds,
    setSessionCookie,
} from '../utils/auth/sessionCookie';
import {
    isAccessSatisfied,
    isUserManagementAvailable,
    isUserManagementPath,
    resolveRequiredAccess,
} from '../utils/auth/rolePolicy';
import { isIpLockedOut, registerIpFailure } from '../utils/auth/loginRateLimiter';
import { BRICKS_BASIC_MODE_ROLE } from '../../modules/common/constants/auth';
import { BRICKS_API_ERROR_CODES } from '../../modules/common/constants/apiErrors';
import type { TBricksUserRole } from '../../modules/common/types/auth';
import { resolveRequestClientIp } from '../utils/requestClientIp';
import { useBricksAuthAdapter } from '../../modules/persistence/server/registry';
import { getBricksDefaultStorageFactory } from '../../modules/persistence/server/defaultStorage';
import { rethrowStatementTimeoutError } from '../../modules/persistence/server/utils/handlerHelpers';
import type { IAuthRequestTarget, TBricksAuthMode } from '../utils/auth/types';

/** Default password from module.ts — in production protected paths are unavailable */
const DEFAULT_PASSWORD = 'change-me';

/**
 * Compares strings in constant time (protection from timing attacks).
 * SHA-256 digests are compared — that equalizes input length for timingSafeEqual.
 */
function safeCompare(a: string, b: string): boolean {
    const hashA = createHash('sha256').update(a).digest();
    const hashB = createHash('sha256').update(b).digest();
    return timingSafeEqual(hashA, hashB);
}

/**
 * Sends 401 Unauthorized with the WWW-Authenticate header (basic mode).
 */
function sendUnauthorized(event: H3Event): never {
    setResponseHeader(event, 'WWW-Authenticate', 'Basic realm="Builder Access"');
    throw createError({
        statusCode: 401,
        statusMessage: 'Unauthorized',
    });
}

/**
 * HTTP Basic Auth of the basic mode.
 */
function handleBasicAuth(event: H3Event): void {
    const config = useRuntimeConfig();
    const username = (config.basicAuthUsername as string | undefined) || 'admin';
    const password = (config.basicAuthPassword as string | undefined) || DEFAULT_PASSWORD;

    // In production the default password equals no protection — refuse explicitly
    if (process.env.NODE_ENV === 'production' && password === DEFAULT_PASSWORD) {
        console.error(
            '[nuxt-bricks] BASIC_AUTH_PASSWORD is not set (or equals the default "change-me") — access to protected paths is blocked in production.'
        );
        throw createError({
            statusCode: 503,
            statusMessage: 'Basic Auth is not configured',
        });
    }

    const authHeader = getHeader(event, 'authorization');

    if (!authHeader || !authHeader.startsWith('Basic ')) {
        return sendUnauthorized(event);
    }

    // Rate limit for invalid credentials: Basic Auth is brute-forced through
    // the same IP bucket as the database login
    const clientIp = resolveRequestClientIp(event);
    const lockoutSeconds = isIpLockedOut(clientIp);

    if (lockoutSeconds > 0) {
        setResponseHeader(event, 'Retry-After', lockoutSeconds);
        throw createError({ statusCode: 429, statusMessage: 'Too many authentication attempts' });
    }

    const base64Credentials = authHeader.slice(6);
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const separatorIndex = credentials.indexOf(':');
    const user = separatorIndex === -1 ? credentials : credentials.slice(0, separatorIndex);
    const pass = separatorIndex === -1 ? '' : credentials.slice(separatorIndex + 1);

    // Both checks always run — no short-circuit on the username
    const userValid = safeCompare(user, username);
    const passValid = safeCompare(pass, password);

    if (!userValid || !passValid) {
        registerIpFailure(clientIp);
        return sendUnauthorized(event);
    }
}

/**
 * Refuses an unauthorized request in database mode:
 * an HTML path → 302 to the login page with a return redirect, the API → 401
 * without WWW-Authenticate (so that the browser does not show the native Basic
 * dialog).
 * The redirect parameter is the logical path (without baseURL): after login it
 * goes into `navigateTo`, where the router prepends base; the Location header
 * itself is built with base.
 */
function rejectDatabaseAuth(event: H3Event, target: IAuthRequestTarget): Promise<void> | never {
    clearSessionCookie(event);

    if (isProtectedHtmlPath(target.logicalPathname, target.prefixes)) {
        const redirect = encodeURIComponent(target.logicalPathname + target.search);
        const loginUrl = `${getBuilderLoginPath(target.prefixes)}?redirect=${redirect}`;
        return sendRedirect(event, joinPathBase(target.baseURL, loginUrl), 302);
    }

    throw createError({
        statusCode: 401,
        statusMessage: 'Unauthorized',
    });
}

/**
 * Refuses a request whose role does not cover what the path requires.
 *
 * 403, not 404: the session is valid, the route exists, and the client has to
 * tell "no rights" from "not authenticated" — otherwise the builder would send
 * a viewer to the login form, where signing in again changes nothing.
 *
 * @param event - Request event.
 * @param role - Role of the requesting user.
 * @param target - Parsed request target.
 */
function assertRoleAllowed(
    event: H3Event,
    role: TBricksUserRole,
    target: IAuthRequestTarget
): void {
    const method = event.node.req.method || 'GET';
    const requirement = resolveRequiredAccess(target.logicalPathname, method);

    if (isAccessSatisfied(role, requirement)) {
        return;
    }

    throw createError({
        statusCode: 403,
        statusMessage: 'Insufficient role',
        data: { code: BRICKS_API_ERROR_CODES.insufficientRole },
    });
}

/**
 * Sliding session renewal: when less than half of the lifetime is left,
 * extends the database record and re-sets the cookie.
 */
async function extendSessionIfNeeded(event: H3Event, expiresAt: string): Promise<void> {
    const maxAgeSeconds = resolveSessionMaxAgeSeconds();
    const remainingMs = new Date(expiresAt).getTime() - Date.now();

    if (remainingMs >= (maxAgeSeconds * 1000) / 2) {
        return;
    }

    const token = getSessionTokenFromCookie(event);

    if (!token) {
        return;
    }

    const nextExpiresAt = new Date(Date.now() + maxAgeSeconds * 1000);

    try {
        await useBricksAuthAdapter().touchSession(hashSessionToken(token), nextExpiresAt);
        setSessionCookie(event, token, maxAgeSeconds);
    } catch (error: unknown) {
        // A failed renewal must not fail an already authorized request
        console.error('[nuxt-bricks] Failed to extend session:', error);
    }
}

/**
 * Database auth: cookie session in Postgres plus sliding renewal.
 */
async function handleDatabaseAuth(event: H3Event, target: IAuthRequestTarget): Promise<void> {
    const config = useRuntimeConfig();

    // Runtime defense: the build-time ban on auth.mode=database plus
    // backend.mode=external is bypassable through runtime env
    // (NUXT_BRICKS_AUTH_MODE + NUXT_BRICKS_DATABASE_URL) — so check against the
    // immutable carrier of external mode instead: the build-time storage adapter
    // factory is installed only by the externalBackendStorage Nitro plugin
    if (getBricksDefaultStorageFactory()) {
        console.error(
            '[nuxt-bricks] auth.mode = "database" is incompatible with backend.mode = "external" — protected paths answer 503'
        );
        throw createError({
            statusCode: 503,
            statusMessage: 'Database auth is not available in external backend mode',
        });
    }

    // Runtime defense: database auth without a database is impossible. The main
    // guard is the module-backend-config build error (auth.mode=database plus
    // backend.mode=external)
    if (!config.bricksDatabaseUrl) {
        throw createError({
            statusCode: 503,
            statusMessage: 'Database auth is not configured',
        });
    }

    let session;

    try {
        session = await resolveSessionUser(event);
    } catch (error: unknown) {
        // A stop by the server statement timeout is not "storage unavailable":
        // it has its own status and machine-readable code by which the builder
        // picks the text. The session check runs before every protected request,
        // so substituting the status here would cover the whole editorial API
        rethrowStatementTimeoutError(error);

        // An unreachable database is an infrastructure problem, neither 401 nor 500
        console.error('[nuxt-bricks] Auth storage error:', error);
        throw createError({
            statusCode: 503,
            statusMessage: 'Auth storage is unavailable',
        });
    }

    if (!session) {
        return rejectDatabaseAuth(event, target);
    }

    event.context.bricksUser = session.user;
    assertRoleAllowed(event, session.user.role, target);
    await extendSessionIfNeeded(event, session.expiresAt);
}

export default defineEventHandler(async (event: H3Event) => {
    // The path is taken from `event.path` and brought to the same shape the
    // router matches against: h3 decodes the path before calling the handler
    // stack, and radix3 drops the trailing slash. Were the matrices matched
    // against the raw URL, `/api/bricks/media/%69mport` and
    // `/api/bricks/media/import/` would miss the access matrix entries and get
    // the default rights, while the router would still call the same admin
    // handler; that is exactly how an editor reached the bulk import.
    //
    // `app.baseURL` is NOT stripped from the path: Nitro mounts global
    // middleware under base, and h3 cuts that prefix before calling the layer,
    // so `event.path` is already the logical path. Strip base a second time and
    // with `baseURL = '/api/'` a request to `/api/api/bricks/media/import`
    // would turn into `/bricks/media/import`: the matrix would take an API
    // handler for a builder HTML page, the CSRF gate would not fire, and the
    // required role would fall to viewer. Further down base is needed only to
    // build the Location of the login redirect.
    const url = event.path || event.node.req.url || '/';
    const queryIndex = url.indexOf('?');
    const rawPathname = queryIndex === -1 ? url : url.slice(0, queryIndex);
    const method = event.node.req.method || 'GET';

    const config = useRuntimeConfig();
    const mode = (config.bricksAuthMode as TBricksAuthMode | undefined) ?? 'basic';
    const prefixes =
        (config.public?.bricksRoutes as IBricksRoutePrefixes | undefined) ??
        DEFAULT_BRICKS_ROUTE_PREFIXES;
    const baseURL = (config.app?.baseURL as string | undefined) || '/';

    const target: IAuthRequestTarget = {
        logicalPathname: normalizePathTrailingSlash(rawPathname),
        search: queryIndex === -1 ? '' : url.slice(queryIndex),
        prefixes,
        baseURL,
    };

    // A disabled user accounts section answers 404 BEFORE every other gate.
    // The check inside the handlers was never reached: the role guard requires
    // an administrator for `/api/bricks/users/**`, so an editor got 403, an
    // anonymous caller got 401 or a login redirect, and a cross-site POST got a
    // CSRF 403. Each of those confirms that the route exists and is merely
    // closed — exactly what the 404 promises to hide. The handlers keep their
    // own check as a second line of defense
    if (
        isUserManagementPath(target.logicalPathname, method) &&
        !isUserManagementAvailable(mode, config.bricksAuthAllowUserManagement)
    ) {
        throw createError({ statusCode: 404, statusMessage: 'Not Found' });
    }

    // CSRF gate for unsafe methods: BEFORE auth — login/logout are not under
    // requiresAuth but are under CSRF; an unauthenticated cross-site POST is 403
    if (isCsrfProtectedPath(target.logicalPathname)) {
        assertCsrfSafe(event);
    }

    if (!requiresAuth(target.logicalPathname, method, mode, prefixes)) {
        return; // Unprotected paths pass through
    }

    if (mode === 'database') {
        return handleDatabaseAuth(event, target);
    }

    handleBasicAuth(event);

    // The basic identity goes through the same matrix as an account: there are
    // no accounts in this mode and no one to narrow rights for, so it is given
    // a role with full editorial rights and the check currently always passes.
    // It is here not to refuse but so that the access matrix applies to both
    // modes through one call: a separate "no role check in basic" branch would
    // become a hole the day the basic role is narrowed. Account handlers stay
    // unavailable in basic anyway — outside database mode they answer 404
    assertRoleAllowed(event, BRICKS_BASIC_MODE_ROLE, target);
});
