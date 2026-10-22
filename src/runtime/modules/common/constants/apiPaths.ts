/**
 * Path namespace of the module API.
 *
 * A constant rather than a literal in each matrix, because the answer to "is
 * this a bricks path?" has to be the same in every layer: the routing of the
 * client and of the dev proxy (`common/utils/localApiPaths.ts`), the protection
 * matrix, the CSRF gate and the access matrix. A fourth copy of the string is
 * how those layers diverge — and a divergence here either closes a path of the
 * consumer or opens one of ours.
 *
 * Paths of the individual endpoints stay written out in full at their call sites
 * (`/api/bricks/health`, `/api/bricks/components`): they pair with the route of
 * the handler in `src/api-handlers.ts` and are searched for as whole strings.
 */
export const BRICKS_API_PREFIX = '/api/bricks';
