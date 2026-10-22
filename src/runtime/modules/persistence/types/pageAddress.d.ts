/**
 * The types of the server-side address check of a published page.
 */

import type { IBricksRoutePrefixes } from '../../common/utils/bricks/routePaths';

export interface IPageAddressContext {
    /** The active prefixes of the bricks surfaces. */
    prefixes: IBricksRoutePrefixes;
    /**
     * Whether the live render of published pages is registered
     * (`features.publishedPages`). With it off a page has no URL of its own — there is
     * no live address to reserve, and the check is skipped (the client decides the same
     * way, otherwise one and the same name would pass the form and fail on the server).
     */
    isLiveSurfaceEnabled: boolean;
}
