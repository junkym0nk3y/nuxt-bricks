import { computed, ref } from 'vue';
import type { IPageVersionSummary, TPublishedPageSummary } from '../../../common/types/bricks-api';
import type { IUsePublishPageVersionsReturn } from '../types/composables';
import { toPageAddress } from '../../../common/utils/bricks/pageAddress';
import { fetchPageVersionsRequest } from '../utils/publishApi';
import { usePublishPreview } from './usePublishPreview';

/**
 * The versions of a page for the details panel of the dashboard: the list of
 * summaries and the preview of a version through the shared preview route
 * `<previewPrefix>/<address>?version=<id>` (see `usePublishPreview`).
 * The request errors are rethrown — the notifications are shown by the calling
 * component.
 */
export function usePublishPageVersions(): IUsePublishPageVersionsReturn {
    const { previewPageVersion } = usePublishPreview();

    const versions = ref<IPageVersionSummary[]>([]);

    // The number of the last request started: by it an answer is cut off when it
    // arrives after the panel has switched to another page, or after a fresher load
    // of the same one (the version list changes on a rollback and on a save)
    let versionsRequestId = 0;

    // A counter rather than a flag: with two parallel loads (the section being
    // expanded plus a reload on a changed revision) the `finally` of the first one
    // would clear the indicator while the second is still running
    const pendingLoads = ref(0);
    const isLoading = computed<boolean>(() => pendingLoads.value > 0);

    /**
     * Clears the list and devalues the request already in flight. Called when the
     * panel switches to another page: without the devaluing the answer of the
     * previous page would land after the clearing and would show its versions as
     * the versions of the new one — and a rollback would go out carrying them.
     */
    function resetVersions(): void {
        versionsRequestId += 1;
        versions.value = [];
    }

    /**
     * Loads the version summaries of a page.
     *
     * A refusal does not wipe the list: the versions already shown outlive a
     * transient refusal, and the message reaches the caller. The refusal of a
     * displaced request is not reported — a notification about it would cover the
     * result of a fresher one.
     *
     * @param pageId - Page identifier.
     */
    async function loadVersions(pageId: string | number): Promise<void> {
        const requestId = ++versionsRequestId;
        pendingLoads.value += 1;

        try {
            const loaded = await fetchPageVersionsRequest(pageId);

            if (requestId !== versionsRequestId) {
                return;
            }

            versions.value = loaded;
        } catch (error: unknown) {
            if (requestId !== versionsRequestId) {
                return;
            }

            throw error;
        } finally {
            pendingLoads.value -= 1;
        }
    }

    /**
     * Opens the preview of a version in a new tab.
     *
     * The snapshot is not loaded: the version travels in the URL (`?version=`) and
     * is pulled by the middleware of the preview route — the tab is rendered by the
     * server in the needed state right away, and the client has nothing to wait
     * for.
     *
     * @param page - The current page (the source of the pagename of the preview route).
     * @param versionId - Version identifier.
     * @returns false when the tab did not open (a popup blocker).
     */
    function previewVersion(page: TPublishedPageSummary, versionId: number): boolean {
        return previewPageVersion(toPageAddress(page.pagename, page.urlPrefix), versionId) !== null;
    }

    return {
        versions,
        isLoading,
        loadVersions,
        previewVersion,
        resetVersions,
    };
}
