/**
 * Access matrix: the minimum role an already authenticated request needs.
 *
 * Called only for paths that the protection matrix (`routeProtection`) found to
 * require authentication — open paths (public read model, health, component
 * manifest, login page) never reach here.
 *
 * The rule is derived from the METHOD and the PREFIX, not from a concrete route
 * with parameters. That is deliberate: the approved access matrix maps onto
 * method semantics one to one — deletion (of pages, versions, media,
 * categories) is available to `admin` only, other writes (saving, publishing,
 * uploading, the device set) to `editor` and above, reads to `viewer`. Parsing
 * `:id` and `**:address` is not needed for that at all, and a second path
 * parser standing next to the Nitro router would inevitably diverge from it at
 * the edges.
 *
 * Registering a separate guard handler on the same `route` + `method` ahead of
 * the main one is impossible: the h3 router keeps a single handler per
 * "route + method" pair (`route.handlers[method] = handler`), so the second
 * registration would evict the first — the guard would either swallow the
 * handler or be swallowed by it.
 *
 * The default for an unknown method is `admin`: a new handler gets the
 * narrowest right, not the widest.
 */
import { BRICKS_ROLE_RANK } from '../../../modules/common/constants/auth';
import { BRICKS_API_PREFIX } from '../../../modules/common/constants/apiPaths';
import { parseBricksBooleanFlag } from '../../../modules/common/utils/main';
import { matchesPathPrefix } from '../../../modules/common/utils/localApiPaths';
import type { TBricksUserRole } from '../../../modules/common/types/auth';
import type { TBricksAccessRequirement } from './types';

/** Read methods: they change nothing, so a viewer may use them */
const READ_METHODS = new Set(['GET', 'HEAD']);

/** Writes that require `editor` */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH']);

/**
 * Paths whose requirement diverges from the method. The key is the exact
 * logical path, the value the required access; matching happens before the
 * per-method rules.
 *
 * `s3-proxy` is a POST but a read in substance: the handler serves a file
 * already registered in the media library (the method was chosen because of the
 * long URL in the body, not because anything is written). Were it to require
 * `editor`, a viewer would get a canvas with no images.
 *
 * `media/import` is the opposite: a POST that registers the whole managed
 * prefix of the storage in the media library at once. That is a bulk operation
 * on the library rather than work on a page, hence `admin`.
 */
const PATH_ACCESS_OVERRIDES: Record<string, TBricksAccessRequirement> = {
    '/api/bricks/media/s3-proxy': 'viewer',
    '/api/bricks/media/import': 'admin',
};

/**
 * Prefix of the account management handlers: administrator only.
 */
const USER_MANAGEMENT_PREFIX = '/api/bricks/users';

/**
 * Own-profile handlers, for which any valid session is enough: exact
 * "method + path" pairs rather than a prefix.
 *
 * Anyone signed in, a viewer included, edits their own name, photo and
 * password — that is the only thing a viewer can change at all, and the profile
 * does not depend on the account section flag.
 *
 * A list and not the prefix `/api/bricks/users/me/**`, because a prefix works
 * fail-open: it also relaxes what is not in it yet. `DELETE /api/bricks/users/me`
 * has no handler of its own and matches the parametric admin route
 * `[id].delete.ts`, and any future admin handler `/users/:id/<action>` would
 * automatically become available to any session at `id=me` the moment its
 * author forgot to duplicate the role guard inside. With an exact list a new
 * handler stays admin-only by default, and relaxing it is a separate deliberate
 * decision.
 *
 * The duplicate role guard inside the `:id` handlers is kept nonetheless
 * (`assertAdminRole`): it also catches the case where the static route somehow
 * did not match.
 *
 * The paths are spelled out in full: `PATH_ACCESS_OVERRIDES` next to it is
 * built the same way — there is still no second parser of parametric paths here.
 */
const OWN_PROFILE_ROUTES: ReadonlySet<string> = new Set([
    'PATCH /api/bricks/users/me',
    'POST /api/bricks/users/me/password',
    'POST /api/bricks/users/me/avatar',
    'DELETE /api/bricks/users/me/avatar',
]);

/**
 * The request is addressed to an own-profile handler.
 *
 * @param pathname - Logical request path (without baseURL and query).
 * @param method - HTTP method.
 */
function isOwnProfileRequest(pathname: string, method: string): boolean {
    return OWN_PROFILE_ROUTES.has(`${method.toUpperCase()} ${pathname}`);
}

/**
 * The path belongs to account management (and therefore disappears together
 * with a disabled section).
 *
 * Own-profile handlers are not part of the section: `allowUserManagement: false`
 * is about keeping accounts outside the module, not about forbidding a person
 * to change their own photo, and the flag is documented exactly that way. The
 * profile checks its own availability (database mode) and closes only the
 * password with a flag of its own.
 *
 * The exception is the same exact "method + path" pairs as in the access
 * matrix: everything else under `/users/me` stays part of the section and
 * answers 404 together with it. Otherwise a disabled section would give itself
 * away with a different status on any uncovered method of that subtree.
 *
 * @param pathname - Logical request path (without baseURL and query).
 * @param method - HTTP method.
 */
export function isUserManagementPath(pathname: string, method: string): boolean {
    if (isOwnProfileRequest(pathname, method)) {
        return false;
    }

    return pathname === USER_MANAGEMENT_PREFIX || pathname.startsWith(`${USER_MANAGEMENT_PREFIX}/`);
}

/**
 * Whether the account management section is available. One rule for two callers
 * — the middleware gate (which answers 404 before any authentication) and the
 * check inside the handlers: had they diverged, they would give different
 * answers to one and the same request.
 *
 * @param mode - Active auth mode.
 * @param allowUserManagementFlag - Value of `bricksAuthAllowUserManagement`
 * (a boolean from the options or a string from env). Unset means enabled, and
 * so does an empty string: `NUXT_BRICKS_AUTH_ALLOW_USER_MANAGEMENT=` reaches the
 * built application as `''`, past the build-time normalization.
 */
export function isUserManagementAvailable(
    mode: string | undefined,
    allowUserManagementFlag: unknown
): boolean {
    // Outside database mode there are no accounts at all, nothing to manage
    if (mode !== 'database') {
        return false;
    }

    return parseBricksBooleanFlag(allowUserManagementFlag, true);
}

/**
 * Whether changing a password from the interface is allowed — both one's own in
 * the profile and someone else's by an administrator. One rule for both
 * handlers: had they diverged, an installation that keeps passwords outside the
 * module would be left with exactly one loophole out of two.
 *
 * @param mode - Active auth mode.
 * @param allowPasswordChangeFlag - Value of `bricksAuthAllowPasswordChange`
 * (a boolean from the options or a string from env). Unset means enabled, and
 * so does an empty string: `NUXT_BRICKS_AUTH_ALLOW_PASSWORD_CHANGE=` reaches the
 * built application as `''`, past the build-time normalization.
 */
export function isPasswordChangeAvailable(
    mode: string | undefined,
    allowPasswordChangeFlag: unknown
): boolean {
    // Outside database mode there are no account passwords at all, nothing to change
    if (mode !== 'database') {
        return false;
    }

    return parseBricksBooleanFlag(allowPasswordChangeFlag, true);
}

/**
 * Returns the minimum access a protected path requires.
 *
 * @param pathname - Logical request path (without baseURL and query).
 * @param method - HTTP method.
 * @returns The required role, or `'authenticated'` when any session is enough.
 */
export function resolveRequiredAccess(
    pathname: string,
    method: string
): Exclude<TBricksAccessRequirement, null> {
    // Builder and preview HTML pages are open to every role: a viewer needs
    // access to the canvas and the preview, and view mode disables editing —
    // refusing at the door would leave them without their only reachable screen.
    // The API is recognized on a segment boundary, so a route of the consumer
    // (`/api/bricksmith`) is treated as somebody else's path, not as ours
    if (!matchesPathPrefix(pathname, BRICKS_API_PREFIX)) {
        return 'viewer';
    }

    // Own profile comes before the account section rule: its paths lie inside
    // the admin prefix, and this ordering is exactly what relaxes them
    if (isOwnProfileRequest(pathname, method)) {
        return 'authenticated';
    }

    if (pathname === USER_MANAGEMENT_PREFIX || pathname.startsWith(`${USER_MANAGEMENT_PREFIX}/`)) {
        return 'admin';
    }

    const override = PATH_ACCESS_OVERRIDES[pathname];

    if (override) {
        return override;
    }

    const normalizedMethod = method.toUpperCase();

    if (READ_METHODS.has(normalizedMethod)) {
        return 'viewer';
    }

    if (normalizedMethod === 'DELETE') {
        return 'admin';
    }

    if (WRITE_METHODS.has(normalizedMethod)) {
        return 'editor';
    }

    return 'admin';
}

/**
 * Checks whether the role covers the access requirement.
 *
 * @param role - Role of the requesting user.
 * @param requirement - Requirement from `resolveRequiredAccess`.
 * @returns true — access is granted.
 */
export function isAccessSatisfied(
    role: TBricksUserRole,
    requirement: Exclude<TBricksAccessRequirement, null>
): boolean {
    if (requirement === 'authenticated') {
        return true;
    }

    return BRICKS_ROLE_RANK[role] >= BRICKS_ROLE_RANK[requirement];
}
