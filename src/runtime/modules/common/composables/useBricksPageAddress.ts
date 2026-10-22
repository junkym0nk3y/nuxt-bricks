// #region Imports
// Types
import type { IUseBricksPageAddressReturn } from '../types/composables';
import type { IBricksPageAddress } from '../types/pageAddress';

// Utils
import {
    UNNAMED_ROUTE_OWNER,
    isEditorAddressTaken,
    isPageAddressTaken,
} from '../utils/bricks/routePaths';

// Composables
import { useBricksRoutePaths } from './useBricksRoutePaths';

// Nuxt
import { useRouter, useRuntimeConfig } from '#imports';
// #endregion

/**
 * Availability of the page addresses according to the REAL routing of the
 * application.
 *
 * The answer comes from `router.resolve` rather than from a list of reserved names:
 * such a list would have to be maintained by hand and would still know nothing about
 * the pages of the consumer application. By asking the router we catch both the
 * builder surfaces and a foreign `pages/about.vue` that would shadow a published
 * address.
 *
 * The server-side validation of the DTOs cannot make use of this (there is no
 * vue-router there) and checks the same rule against the module's own routes — that
 * is, it stays a safety net rather than a full equivalent.
 */
export function useBricksPageAddress(): IUseBricksPageAddressReturn {
    const router = useRouter();
    const { prefixes } = useBricksRoutePaths();

    /**
     * The live surface is switched off (`features.publishedPages: false`) — a page
     * has no URL of its own, so it can take nothing. That is exactly why the flag is
     * public: the server-side validation reads the same one and makes the same
     * decision.
     */
    const isLiveSurfaceEnabled = useRuntimeConfig().public.bricksPublishedPages !== false;

    /**
     * Name of the route that wins the path. `undefined` — the path does not match at
     * all; `UNNAMED_ROUTE_OWNER` — there is a route, but it has no string name.
     *
     * @param path - Logical path without the baseURL.
     */
    function resolveRouteName(path: string): string | undefined {
        const { matched } = router.resolve(path);

        if (matched.length === 0) {
            return undefined;
        }

        const owner = matched[matched.length - 1]?.name;

        return typeof owner === 'string' ? owner : UNNAMED_ROUTE_OWNER;
    }

    /**
     * Whether the live address of the page (`/<urlPrefix>/<pagename>`) is free.
     *
     * @param address - Page address.
     */
    function isPageAddressFree(address: IBricksPageAddress): boolean {
        if (!isLiveSurfaceEnabled) {
            return true;
        }

        return !isPageAddressTaken(prefixes, resolveRouteName, address);
    }

    /**
     * Whether the editor address of the page
     * (`<builderPrefix>/<urlPrefix>/<pagename>`) is free.
     *
     * @param address - Page address.
     */
    function isEditorAddressFree(address: IBricksPageAddress): boolean {
        return !isEditorAddressTaken(prefixes, resolveRouteName, address);
    }

    return { isPageAddressFree, isEditorAddressFree };
}
