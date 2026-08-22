/**
 * Path protection matrix — shared by the basic and database modes
 * (`server/middleware/auth.ts`).
 *
 * Protected (builder/preview prefixes come from `bricks.routes`, defaults
 * `/bricks` and `/bricks-preview`):
 * - `<builderPrefix>/**` — page manager and editor
 * - `<previewPrefix>/**` — render preview
 * - /api/bricks/** — the entire editorial API, reads included (page lists with
 *   drafts/schema and the media library are not public), media proxy and page
 *   thumbnail
 *
 * Open are only the public read model (GET/HEAD /api/bricks/public/** —
 * published projections for the renderer), the health probes (GET/HEAD
 * /api/bricks/health and /health/ready — a load balancer cannot authenticate)
 * and the component library (GET/HEAD /api/bricks/components — the manifest
 * describes the contents of the library: names, categories, brick file paths
 * and their editorial metadata, that is exactly what goes into the client
 * bundle anyway). Database-only exceptions: `<builderPrefix>/bricks-login` (the
 * login page) and /api/bricks/auth/** (login/logout/me) — otherwise the form is
 * unreachable.
 *
 * All functions take the LOGICAL path (without `app.baseURL`): h3 cuts the
 * mount prefix of the middleware before calling it, so the middleware already
 * hands the matrix a stripped path.
 */
import type { TBricksAuthMode } from './types';
import {
    getBuilderLoginPath,
    isProtectedBricksHtmlPath,
    type IBricksRoutePrefixes,
} from '../../../modules/common/utils/bricks/routePaths';

/** Read methods allowed on the public read model without authentication */
const PUBLIC_READ_METHODS = ['GET', 'HEAD'];

/**
 * The path is a builder/preview HTML page (used to choose redirect vs 401).
 *
 * @param pathname - Logical request path (without baseURL and query).
 * @param prefixes - Active route prefixes.
 */
export function isProtectedHtmlPath(pathname: string, prefixes: IBricksRoutePrefixes): boolean {
    return isProtectedBricksHtmlPath(prefixes, pathname);
}

/**
 * Checks whether the request requires authentication in the given mode.
 *
 * @param pathname - Logical request path (without baseURL and query).
 * @param method - HTTP method.
 * @param mode - Active auth mode.
 * @param prefixes - Active route prefixes.
 * @returns true — the path is protected.
 */
export function requiresAuth(
    pathname: string,
    method: string,
    mode: TBricksAuthMode,
    prefixes: IBricksRoutePrefixes
): boolean {
    // Database mode: the login page and the auth handlers are open — otherwise
    // there is no way to sign in
    if (mode === 'database') {
        if (
            pathname === getBuilderLoginPath(prefixes) ||
            pathname.startsWith('/api/bricks/auth/')
        ) {
            return false;
        }
    }

    if (isProtectedHtmlPath(pathname, prefixes)) {
        return true;
    }

    // Public read model — the only open part of /api/bricks (reads only)
    if (pathname.startsWith('/api/bricks/public/') && PUBLIC_READ_METHODS.includes(method)) {
        return false;
    }

    // Health probes of a load balancer or orchestrator cannot authenticate — so
    // they are open (reads only; the handlers disclose no environment details)
    if (
        (pathname === '/api/bricks/health' || pathname === '/api/bricks/health/ready') &&
        PUBLIC_READ_METHODS.includes(method)
    ) {
        return false;
    }

    // The component library is open for reading: the manifest holds names,
    // categories, brick file paths and the editorial metadata of the entries
    // (`description`, `values`, `slots`) — exactly what goes into the client
    // bundle anyway. The former rationale ("the builder SSR does not forward
    // Authorization") is withdrawn: request identity is now forwarded to local
    // handlers (useApiClient), which means the handler could be closed too —
    // that is a separate decision, not a consequence of fixing the forwarding
    if (pathname === '/api/bricks/components' && PUBLIC_READ_METHODS.includes(method)) {
        return false;
    }

    // Editorial API — protected in full, GET included (drafts, full schema,
    // media library)
    if (pathname.startsWith('/api/bricks')) {
        return true;
    }

    return false;
}
