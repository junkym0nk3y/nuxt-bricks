/**
 * Manifest of the /api/bricks/** Nitro handlers (persistence, auth, health and
 * the builder surface: component library, media proxy, page thumbnail, page
 * templates).
 *
 * Module routes are not auto-scanned — module.ts registers every entry through
 * addServerHandler (`file` is a path from runtimeDir, without the extension).
 *
 * The order of entries does not affect matching: the h3 router ranks a static
 * segment above a parameter one on its own, whatever the registration order,
 * and looks handlers up per method. The order here is for the reader: the
 * specific routes of a subtree stand together above the generic
 * `/api/bricks/:id`, so the whole set is visible at once.
 */
import type { IBricksApiHandler } from './types/apiHandlers';

export const BRICKS_API_HANDLERS: IBricksApiHandler[] = [
    { route: '/api/bricks', method: 'get', file: 'server/api/bricks/index.get' },
    { route: '/api/bricks', method: 'post', file: 'server/api/bricks/index.post' },
    {
        route: '/api/bricks/auth/login',
        method: 'post',
        file: 'server/api/bricks/auth/login.post',
    },
    {
        route: '/api/bricks/auth/logout',
        method: 'post',
        file: 'server/api/bricks/auth/logout.post',
    },
    {
        route: '/api/bricks/auth/me',
        method: 'get',
        file: 'server/api/bricks/auth/me.get',
    },
    {
        // The rest of the path rather than `:pagename`: a page is identified by
        // its full address (`<urlPrefix>/<pagename>`), whose segment count varies
        route: '/api/bricks/public/pages/**:address',
        method: 'get',
        file: 'server/api/bricks/public/pages/[...address].get',
        isPublic: true,
    },
    {
        route: '/api/bricks/health',
        method: 'get',
        file: 'server/api/bricks/health/index.get',
        isPublic: true,
    },
    {
        route: '/api/bricks/health/ready',
        method: 'get',
        file: 'server/api/bricks/health/ready.get',
        isPublic: true,
    },
    {
        // Open for GET/HEAD in the auth matrix (routeProtection.ts): the manifest
        // describes the library — names, categories, brick file paths and the
        // editorial metadata of the entries, which is exactly what goes into the
        // client bundle anyway
        route: '/api/bricks/components',
        method: 'get',
        file: 'server/api/bricks/components.get',
    },
    {
        route: '/api/bricks/media',
        method: 'get',
        file: 'server/api/bricks/media/index.get',
    },
    {
        route: '/api/bricks/media/s3-proxy',
        method: 'post',
        file: 'server/api/bricks/media/s3-proxy.post',
    },
    {
        route: '/api/bricks/media/s3-page-thumbnail',
        method: 'post',
        file: 'server/api/bricks/media/s3-page-thumbnail.post',
    },
    {
        route: '/api/bricks/media/upload',
        method: 'post',
        file: 'server/api/bricks/media/upload.post',
    },
    {
        route: '/api/bricks/media/import',
        method: 'post',
        file: 'server/api/bricks/media/import.post',
    },
    {
        route: '/api/bricks/media/categories',
        method: 'get',
        file: 'server/api/bricks/media/categories/index.get',
    },
    {
        route: '/api/bricks/media/categories',
        method: 'post',
        file: 'server/api/bricks/media/categories/index.post',
    },
    {
        route: '/api/bricks/media/categories/:slug',
        method: 'delete',
        file: 'server/api/bricks/media/categories/[slug].delete',
    },
    {
        route: '/api/bricks/media/:id',
        method: 'patch',
        file: 'server/api/bricks/media/[id].patch',
    },
    {
        route: '/api/bricks/media/:id',
        method: 'delete',
        file: 'server/api/bricks/media/[id].delete',
    },
    {
        route: '/api/bricks/users',
        method: 'get',
        file: 'server/api/bricks/users/index.get',
    },
    {
        route: '/api/bricks/users',
        method: 'post',
        file: 'server/api/bricks/users/index.post',
    },
    {
        // The own-profile handlers stand above the parametric ones: `me` is not a
        // number, so read as an `:id` this path would answer 400 instead of
        // reaching its own handler. The router prefers the static segment by
        // itself; the manifest order only makes that visible while reading
        route: '/api/bricks/users/me',
        method: 'patch',
        file: 'server/api/bricks/users/me.patch',
    },
    {
        route: '/api/bricks/users/me/password',
        method: 'post',
        file: 'server/api/bricks/users/me/password.post',
    },
    {
        route: '/api/bricks/users/me/avatar',
        method: 'post',
        file: 'server/api/bricks/users/me/avatar.post',
    },
    {
        route: '/api/bricks/users/me/avatar',
        method: 'delete',
        file: 'server/api/bricks/users/me/avatar.delete',
    },
    {
        route: '/api/bricks/users/:id/password',
        method: 'post',
        file: 'server/api/bricks/users/[id]/password.post',
    },
    {
        route: '/api/bricks/users/:id',
        method: 'patch',
        file: 'server/api/bricks/users/[id].patch',
    },
    {
        route: '/api/bricks/users/:id',
        method: 'delete',
        file: 'server/api/bricks/users/[id].delete',
    },
    {
        // The whole templates block stands above the generic /api/bricks/:id: the
        // pair "method + one segment" collides there, and `templates` is the
        // static side the router picks
        route: '/api/bricks/templates',
        method: 'get',
        file: 'server/api/bricks/templates/index.get',
    },
    {
        route: '/api/bricks/templates',
        method: 'post',
        file: 'server/api/bricks/templates/index.post',
    },
    {
        route: '/api/bricks/templates/:id',
        method: 'get',
        file: 'server/api/bricks/templates/[id].get',
    },
    {
        route: '/api/bricks/templates/:id',
        method: 'patch',
        file: 'server/api/bricks/templates/[id].patch',
    },
    {
        route: '/api/bricks/templates/:id',
        method: 'delete',
        file: 'server/api/bricks/templates/[id].delete',
    },
    {
        route: '/api/bricks/:id/versions',
        method: 'get',
        file: 'server/api/bricks/[id]/versions/index.get',
    },
    {
        route: '/api/bricks/:id/versions/:versionId',
        method: 'get',
        file: 'server/api/bricks/[id]/versions/[versionId].get',
    },
    {
        route: '/api/bricks/:id/versions/:versionId/restore',
        method: 'post',
        file: 'server/api/bricks/[id]/versions/[versionId]/restore.post',
    },
    { route: '/api/bricks/:id', method: 'get', file: 'server/api/bricks/[id].get' },
    { route: '/api/bricks/:id', method: 'put', file: 'server/api/bricks/[id].put' },
    { route: '/api/bricks/:id', method: 'patch', file: 'server/api/bricks/[id].patch' },
    { route: '/api/bricks/:id', method: 'delete', file: 'server/api/bricks/[id].delete' },
];
