// #region Imports
// Types
import type { TPublishedPageSummary } from '../../../common/types/bricks-api';
import type { IBricksPageAddress } from '../../../common/types/pageAddress';
import type {
    IBuilderPageSelectorOptions,
    IUseBuilderPageSelectorReturn,
} from '../types/composables';

// Utils
import {
    getBuilderPageRouteLocation,
    getPageAddressKey,
    isSamePageAddress,
    toPageAddress,
} from '../../../common/utils/bricks/pageAddress';

// Vue
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Nuxt
import { useRouter } from '#imports';

// Pinia
import { usePublishStore } from '../../publish/stores/publish';

// Composables
import { usePublishSchemaImport } from '../../publish/composables/usePublishSchemaImport';
// #endregion

/**
 * Longer than an ordinary toast: the message explains a state that has diverged
 * and what to do next — there has to be time to read it.
 */
const REPLACED_PAGE_NOTICE_MS = 10000;

/**
 * The wiring of the page selector in the toolbar: loading and refreshing the list,
 * the move onto a chosen page and the creation of a new one.
 *
 * It lives next to the composition root rather than in the toolbar itself: the
 * list belongs to the publish store and the navigation to the router of the page,
 * and the toolbar is to know about neither of them.
 *
 * @param options - The identity of the open session and the way to reopen it.
 */
export function useBuilderPageSelector(
    options: IBuilderPageSelectorOptions
): IUseBuilderPageSelectorReturn {
    // #region Data
    const router = useRouter();
    const publishStore = usePublishStore();
    const { t } = useI18n();

    const isPagesRefreshing = ref(false);

    // An unfinished refresh: frequent openings of the popup are not to multiply
    // the requests
    let pagesRefreshPromise: Promise<void> | null = null;

    // The creation of a page by the window of the pages manager — together with the
    // resolver of the images of an imported schema, otherwise the import would
    // behave differently in the two places. The mount latch is never lowered again:
    // lowered, it would recreate the component and lose the closing animation
    const shouldMountCreatePageModal = ref(false);
    const isCreatePageModalOpen = ref(false);
    const schemaImport = usePublishSchemaImport({ onNotify: options.showToast });

    // The generation of the session as of the moment the create window was opened.
    // The builder page outlives a change of `:pagename` (a static page key), so the
    // window and its request live longer than the session they were opened in
    let createStartedIn: number | null = null;
    // #endregion

    // #region Methods
    /**
     * Loads and refreshes the page list for the opening of the selector: pages are
     * created and deleted in a neighboring tab too, while the list lives in the
     * store until the application is reloaded.
     *
     * A refusal is put out into the console: the list is a cache rather than the
     * data of a session. A toast would declare broken a popup that holds a perfectly
     * usable previous list, and the blocking screen of the session has even less to
     * do with it.
     */
    async function handleOpenPageSelector(): Promise<void> {
        if (pagesRefreshPromise) {
            return;
        }

        isPagesRefreshing.value = true;
        const request =
            publishStore.pagesLoadedAt === null
                ? publishStore.ensurePagesLoaded()
                : publishStore.loadAllPages();
        pagesRefreshPromise = request;

        try {
            await request;
        } catch (error: unknown) {
            console.warn('[Builder] Failed to refresh pages for selector:', error);
        } finally {
            if (pagesRefreshPromise === request) {
                pagesRefreshPromise = null;
                isPagesRefreshing.value = false;
            }
        }
    }

    /**
     * Moves onto the chosen page.
     *
     * Unsaved edits outlive the move: the autosave flushes the draft synchronously
     * on a change of the route, and on the way back a restore of it will be offered.
     *
     * A matching address under a different identifier is a special case: the page at
     * that address has been replaced elsewhere (deleted and created anew). It cannot
     * be opened here: the route is the same one, so the session would have to be
     * reopened directly, and such a move goes around the synchronous flush of the
     * draft and leads to its removal — the bootstrap finds the record belonging to
     * the former page. The edits of the open page cannot be saved by this moment
     * anyway (its row is no longer in the list), and the draft is their only copy, so
     * instead of quietly replacing the content the situation is explained: reloading
     * the editor is left to the person, and until then they may save a copy.
     *
     * @param page - The chosen page.
     */
    async function handleSelectPage(page: TPublishedPageSummary): Promise<void> {
        if (String(page.id) === String(options.sessionPageId.value)) {
            return;
        }

        const address = toPageAddress(page.pagename, page.urlPrefix);

        if (isSamePageAddress(address, options.routeAddress.value)) {
            options.showToast(
                t('bricks.toolbar.pageSelector.replaced', {
                    pagename: getPageAddressKey(address),
                }),
                'error',
                REPLACED_PAGE_NOTICE_MS
            );
            return;
        }

        await router.push(getBuilderPageRouteLocation(address));
    }

    /**
     * Opens the create-page window.
     */
    function handleOpenCreatePage(): void {
        createStartedIn = options.sessionToken.capture();
        shouldMountCreatePageModal.value = true;
        isCreatePageModalOpen.value = true;
    }

    /**
     * Closes the create-page window.
     */
    function handleCloseCreatePage(): void {
        isCreatePageModalOpen.value = false;
    }

    /**
     * Takes the person into the editor of the created page.
     *
     * The move happens only when the session is the one the window was opened in.
     * The image resolver and the POST itself outlive a navigation (the builder page
     * is not remounted on a change of `:pagename`), and to take the person away from
     * the page they have gone to meanwhile would be to undo their own action. In
     * that case the created page is reported with a toast — it has been created, and
     * that has to be known.
     *
     * @param address - The address of the created page.
     */
    async function handlePageCreated(address: IBricksPageAddress): Promise<void> {
        isCreatePageModalOpen.value = false;

        if (createStartedIn !== null && !options.sessionToken.isCurrent(createStartedIn)) {
            options.showToast(
                t('bricks.toolbar.pageSelector.created', {
                    pagename: getPageAddressKey(address),
                }),
                'success'
            );
            return;
        }

        await router.push(getBuilderPageRouteLocation(address));
    }
    // #endregion

    return {
        isPagesRefreshing,
        shouldMountCreatePageModal,
        isCreatePageModalOpen,
        schemaImport,
        handleOpenPageSelector,
        handleSelectPage,
        handleOpenCreatePage,
        handleCloseCreatePage,
        handlePageCreated,
    };
}
