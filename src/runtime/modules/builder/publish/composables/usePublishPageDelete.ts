// #region Imports
// Types
import type { TPublishedPageSummary } from '../../../common/types/bricks-api';
import type {
    IUsePublishPageDeleteOptions,
    IUsePublishPageDeleteReturn,
} from '../types/composables';

// Utils
import { isRequestTimeoutError } from '../../../common/utils/apiRequestPolicy';
import { getPublishedPagePath } from '../../../common/utils/bricks/routePaths';
import { toPageAddress } from '../../../common/utils/bricks/pageAddress';

// Vue
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Pinia
import { usePublishStore } from '../stores/publish';
// #endregion

/**
 * The confirm flow of deleting a page for the dashboard: the state of the
 * confirmation, the description carrying the address of the page and the deletion
 * through the publish store.
 *
 * Apart from the host for the same reason as the rollback to a version
 * (`usePublishVersionRestore`): the confirmation of an irreversible action is a
 * state of its own, a text of its own and a refusal policy of its own, and the
 * dashboard host assembles six modals even without it.
 *
 * @param options - The notifications and the reaction to a deletion.
 * @returns The state of the confirmation and the deletion operations.
 */
export function usePublishPageDelete(
    options: IUsePublishPageDeleteOptions
): IUsePublishPageDeleteReturn {
    // #region Data
    const { t } = useI18n();
    const publishStore = usePublishStore();

    const pendingDeletePage = ref<TPublishedPageSummary | null>(null);
    const isDeleteConfirmationOpen = ref(false);
    const isDeleting = ref(false);
    // #endregion

    // #region Computed
    const deleteConfirmationDescription = computed<string>(() => {
        const page = pendingDeletePage.value;

        if (!page) {
            return t('bricks.publish.dashboard.deleteConfirm.generic');
        }

        return t('bricks.publish.dashboard.deleteConfirm.named', {
            title: page.title,
            // The full address: for pages sharing a name under different prefixes
            // a path built out of the name alone would coincide, and with equal
            // titles a person would not know which of them they are deleting
            path: getPublishedPagePath(toPageAddress(page.pagename, page.urlPrefix)),
        });
    });
    // #endregion

    // #region Methods
    /**
     * Asks for the deletion of the page to be confirmed.
     *
     * @param page - The page.
     */
    function requestDeletePage(page: TPublishedPageSummary): void {
        pendingDeletePage.value = page;
        isDeleteConfirmationOpen.value = true;
    }

    /**
     * Closes the deletion confirmation.
     *
     * @param force - Close it even while the deletion is running.
     */
    function closeDeleteConfirmation(force = false): void {
        if (!force && isDeleting.value) {
            return;
        }

        isDeleteConfirmationOpen.value = false;
        pendingDeletePage.value = null;
    }

    /**
     * Confirms and performs the deletion of the page (the preview file in the
     * storage is cleaned up best-effort by the server in DELETE /api/bricks/:id).
     *
     * A settled refusal of the server leaves the confirmation open — the page is
     * where it was, and the retry is at hand. An abort by the waiting ceiling
     * closes it: the outcome is unknown, the page may have been deleted, and the
     * message about it asks outright to refresh the data first (the store re-reads
     * the list itself) rather than to retry.
     */
    async function confirmDeletePage(): Promise<void> {
        const page = pendingDeletePage.value;

        if (!page) {
            return;
        }

        isDeleting.value = true;

        try {
            await publishStore.deletePage(page.id);
            options.onDeleted(String(page.id));
            closeDeleteConfirmation(true);
        } catch (error: unknown) {
            const message =
                error instanceof Error
                    ? error.message
                    : t('bricks.publish.dashboard.toasts.deleteFailed');
            options.onNotify(message, 'error');

            if (isRequestTimeoutError(error)) {
                closeDeleteConfirmation(true);
            }
        } finally {
            isDeleting.value = false;
        }
    }
    // #endregion

    return {
        isDeleteConfirmationOpen,
        isDeleting,
        deleteConfirmationDescription,
        requestDeletePage,
        closeDeleteConfirmation,
        confirmDeletePage,
    };
}
