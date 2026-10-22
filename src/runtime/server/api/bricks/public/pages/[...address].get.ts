import { createError, defineEventHandler, getRouterParam } from 'h3';
import type { IBricksPageAddress } from '../../../../../modules/common/types/pageAddress';
import { isValidPageAddress } from '../../../../../modules/common/utils/bricks/pageAddress';
import { useBricksStorageAdapter } from '../../../../../modules/persistence/server/registry';
import { toHttpError } from '../../../../../modules/persistence/server/utils/handlerHelpers';
import { toPublicPageProjection } from '../../../../../modules/persistence/server/utils/publicProjection';

/**
 * GET /api/bricks/public/pages/<urlPrefix>/<pagename> — the public projection of
 * a published page (a direct lookup by address, without list plus find).
 * Draft pages and editor-only fields (thumbnailUrl) are never handed outward:
 * not published means 404.
 *
 * The address arrives as the rest of the path rather than as a pair of
 * parameters: a page is identified by its full address, whose last segment is
 * `pagename` and everything before it is `urlPrefix`. A name alone no longer
 * identifies a page: `/blog/post` and `/news/post` are different pages, and a
 * lookup by name would return an arbitrary one of them.
 */

/**
 * Parses the rest of the path into a page address: the last segment is
 * `pagename`, the preceding ones are `urlPrefix`. Empty segments (a double slash,
 * a trailing slash) are dropped, so `blog/post` and `blog/post/` give one and the
 * same address.
 *
 * @param rawAddress - The rest of the path after `public/pages/`.
 * @returns The address, or null when there are no segments at all.
 */
function parseAddressPath(rawAddress: string): IBricksPageAddress | null {
    const segments = rawAddress.split('/').filter(Boolean);
    const pagename = segments.pop();

    if (pagename === undefined) {
        return null;
    }

    return {
        pagename,
        urlPrefix: segments.length > 0 ? segments.join('/') : null,
    };
}

export default defineEventHandler(async (event) => {
    const address = parseAddressPath(getRouterParam(event, 'address', { decode: true }) ?? '');

    // An invalid format is indistinguishable from a page that does not exist —
    // 404 with no details. The check is shared with the form and the DTO
    // (`isValidPageAddress`): a copy of the rules of its own here would accept
    // addresses that the write path never creates
    if (!address || !isValidPageAddress(address)) {
        throw createError({ statusCode: 404, statusMessage: 'Page not found' });
    }

    try {
        const page = await useBricksStorageAdapter().getPageByAddress(address);

        if (!page || page.published !== true) {
            throw createError({ statusCode: 404, statusMessage: 'Page not found' });
        }

        return toPublicPageProjection(page);
    } catch (error: unknown) {
        toHttpError(error, 'Failed to fetch page');
    }
});
