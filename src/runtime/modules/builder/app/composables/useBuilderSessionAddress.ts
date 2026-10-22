// #region Imports
// Types
import type { IBricksPageAddress } from '../../../common/types/pageAddress';
import type {
    IBuilderSessionAddressOptions,
    IUseBuilderSessionAddressReturn,
} from '../types/session';

// Utils
import { migrateBuilderDraft } from '../../publish/utils/draftStorage';
import {
    getBuilderPageRouteLocation,
    isSamePageAddress,
    resolvePageAddressFromRoute,
} from '../../../common/utils/bricks/pageAddress';
import { BRICKS_BUILDER_PAGE_ROUTE_NAMES } from '../../../common/constants/routes';

// Vue
import { computed, ref } from 'vue';

// Nuxt
import { useRoute, useRouter } from '#imports';
// #endregion

/**
 * The owner of the address of a builder session — the single source of truth for
 * the URL and for the key of the drafts.
 *
 * `routeAddress` is the address out of the route params (the source of truth of
 * the URL); `sessionAddress` is the address the current session is open on (the
 * key of the localStorage drafts). A divergence of the values means a navigation
 * onto another page — the watcher in `useBuilderSession` follows that.
 *
 * The address rather than the `pagename` alone: the editors and the drafts of
 * `/blog/post` and `/news/post` are obliged to differ, and their name is one.
 *
 * @param options - The message about an unreachable storage: moving a draft is one
 * more path on which a refusal of the storage would otherwise stay in the console.
 */
export function useBuilderSessionAddress(
    options: IBuilderSessionAddressOptions
): IUseBuilderSessionAddressReturn {
    const route = useRoute();
    const router = useRouter();

    const routeAddress = computed<IBricksPageAddress>(() =>
        resolvePageAddressFromRoute(route.params)
    );
    const sessionAddress = ref<IBricksPageAddress>(routeAddress.value);

    /**
     * Moves the open session onto a new address: migrates the localStorage draft
     * and synchronizes the URL through Vue Router — `route.params` is updated, so
     * the autosave and the restore after a reload work under the current key. No
     * second bootstrap of the session happens: `sessionAddress` is updated before
     * the navigation, and the builder page has a static page key (see
     * `definePageMeta` in `pages/[pagename].vue`).
     *
     * A change of the prefix is the same move as a change of the name: the address
     * of the editor includes the prefix, so the URL and the key of the draft are
     * obliged to catch up with both halves of the pair.
     *
     * @param next - The new address of the page.
     */
    async function renameSession(next: IBricksPageAddress): Promise<void> {
        if (!next.pagename.trim() || isSamePageAddress(next, sessionAddress.value)) {
            return;
        }

        // The builder page has been left already (a move onto the dashboard, for
        // one) — the URL is not touched
        if (
            typeof route.name !== 'string' ||
            !BRICKS_BUILDER_PAGE_ROUTE_NAMES.includes(route.name)
        ) {
            return;
        }

        if (sessionAddress.value.pagename) {
            // A taken target key is an ordinary thing (a session owns a key of
            // its own), while a refusal of the storage means the draft may have
            // stayed behind under the previous address: the autosave goes on
            // writing under the new key and reports the breakage nowhere itself
            const migration = migrateBuilderDraft(
                options.draftPrincipal,
                sessionAddress.value,
                next
            );

            if (migration === 'storage-unavailable') {
                options.draftStorageNotice.report();
            }
        }
        sessionAddress.value = next;

        if (!isSamePageAddress(routeAddress.value, next)) {
            await router.replace(getBuilderPageRouteLocation(next));
        }
    }

    return { routeAddress, sessionAddress, renameSession };
}
