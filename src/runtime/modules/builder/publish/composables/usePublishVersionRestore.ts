import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { IPageVersionSummary, TPublishedPageSummary } from '../../../common/types/bricks-api';
import type {
    IPendingVersionRestore,
    IUsePublishVersionRestoreOptions,
    IUsePublishVersionRestoreReturn,
} from '../types/composables';
import { isRequestTimeoutError } from '../../../common/utils/apiRequestPolicy';
import { usePublishStore } from '../stores/publish';
import { formatPageVersionDateTime } from '../utils/dates';

/**
 * The confirm flow of rolling a page back to a version for the dashboard: the
 * state of the confirmation modal, the description carrying the date of the
 * version and the rollback performed through the publish store (the success and
 * error toasts go through `onNotify`).
 */
export function usePublishVersionRestore(
    options: IUsePublishVersionRestoreOptions
): IUsePublishVersionRestoreReturn {
    const { t } = useI18n();
    const publishStore = usePublishStore();

    const pendingRestore = ref<IPendingVersionRestore | null>(null);
    const isRestoreConfirmationOpen = ref(false);
    const isRestoring = ref(false);

    const restoreConfirmationDescription = computed<string>(() => {
        const restore = pendingRestore.value;
        if (!restore) {
            return '';
        }

        // The same date the version card in the gallery is signed with: the
        // confirmation of an irreversible action is obliged to name the chosen
        // state the same way
        return t('bricks.publish.dashboard.details.versions.restoreConfirm.description', {
            date: formatPageVersionDateTime(restore.version),
        });
    });

    /**
     * Asks for the rollback of the page to a saved version to be confirmed.
     *
     * @param page - The page.
     * @param version - Version summary.
     */
    function requestRestoreVersion(
        page: TPublishedPageSummary,
        version: IPageVersionSummary
    ): void {
        pendingRestore.value = { page, version };
        isRestoreConfirmationOpen.value = true;
    }

    /**
     * Closes the rollback confirmation.
     *
     * @param force - Close it even while the rollback is running.
     */
    function closeRestoreConfirmation(force = false): void {
        if (!force && isRestoring.value) {
            return;
        }

        isRestoreConfirmationOpen.value = false;
        pendingRestore.value = null;
    }

    /**
     * Confirms and performs the rollback to a version (schema + layout +
     * backgroundColor).
     *
     * A settled refusal leaves the confirmation open — a retry is safe and at
     * hand. An abort by the waiting ceiling closes it: the outcome is unknown, the
     * rollback may have been applied, and the message about it asks to refresh the
     * data first (the store re-reads the list itself), while a repeated rollback
     * would go out with a stale revision.
     */
    async function confirmRestoreVersion(): Promise<void> {
        const restore = pendingRestore.value;
        if (!restore) {
            return;
        }

        isRestoring.value = true;
        try {
            await publishStore.restorePageVersion(restore.page.id, restore.version.id);
            options.onNotify(
                t('bricks.publish.dashboard.details.versions.toasts.restored'),
                'success'
            );
            closeRestoreConfirmation(true);
        } catch (error: unknown) {
            const message =
                error instanceof Error
                    ? error.message
                    : t('bricks.publish.dashboard.details.versions.toasts.restoreFailed');
            options.onNotify(message, 'error');

            if (isRequestTimeoutError(error)) {
                closeRestoreConfirmation(true);
            }
        } finally {
            isRestoring.value = false;
        }
    }

    return {
        isRestoreConfirmationOpen,
        isRestoring,
        restoreConfirmationDescription,
        requestRestoreVersion,
        closeRestoreConfirmation,
        confirmRestoreVersion,
    };
}
