import type { IBricksSchema } from '../../../common/types/brick';
import type { IPreviewStoredPage } from '../../../common/types/bricks-api';
import type { IBricksPageAddress } from '../../../common/types/pageAddress';
import type { IUsePublishPreviewReturn } from '../types/composables';
import { useBricksRoutePaths } from '../../../common/composables/useBricksRoutePaths';
import { isValidPageAddress, toPageAddress } from '../../../common/utils/bricks/pageAddress';
import { translateBricksKey as t } from '../../../common/utils/globalI18n';
import { usePublishStore } from '../stores/publish';

/**
 * The preview of the current landing: puts a snapshot of the page into
 * localStorage (`bricks-preview-page`) and opens the preview route in a new tab.
 * The errors are written into the `generalError` of the publish store.
 */
export function usePublishPreview(): IUsePublishPreviewReturn {
    const publishStore = usePublishStore();
    const { previewPagePath, withBase } = useBricksRoutePaths();

    /**
     * Generates the URL of a preview — the built-in preview route
     * `<previewPrefix>/<address>`, with `app.baseURL` (opened by window.open).
     *
     * @param address - Page address.
     * @param versionId - The id of a saved version (without it, the current state).
     */
    function generatePreviewUrl(address: IBricksPageAddress, versionId?: number): string {
        return withBase(previewPagePath(address, versionId));
    }

    /**
     * Opens the preview route in a new tab and reports whether the tab did open.
     *
     * A popup blocker returns null — without the check the refusal would be a silent
     * one, and the argument holds for every surface that opens a preview, not for the
     * one that happened to write it down. What to show on a refusal is left to the
     * caller: the toast of the dashboard and the `null` of the two others are
     * different answers to the same fact.
     *
     * Two expected refusals are normalized here — no `window` and a blocked tab.
     * A defect of the route building is deliberately NOT caught: it would arrive at
     * the caller as an indistinguishable popup blocker.
     *
     * @param address - Page address.
     * @param versionId - The id of a saved version (without it, the current state).
     * @returns Whether the tab was opened.
     */
    function openPreviewTab(address: IBricksPageAddress, versionId?: number): boolean {
        if (typeof window === 'undefined') {
            console.warn('[Publish Preview] Cannot open a preview tab: window is not available');

            return false;
        }

        return window.open(generatePreviewUrl(address, versionId), '_blank') !== null;
    }

    /**
     * Creates a preview of the current landing out of the form state of the
     * publish store.
     *
     * @param schema - Landing schema.
     * @returns The address of the opened preview, or null on an error.
     */
    function previewCurrentPage(schema: IBricksSchema): IBricksPageAddress | null {
        if (typeof window === 'undefined') {
            console.warn('[Publish Preview] previewCurrentPage: window is not available');

            return null;
        }

        try {
            const formState = publishStore.currentFormState;
            // One reading of the clock for both: the fallback address and the id of
            // the snapshot describe one and the same preview, and two calls would
            // hand them timestamps a millisecond apart
            const previewId = Date.now();
            // The address of the form fits the preview URL only whole and only
            // when valid: a preview is opened out of an invalid form too, and an
            // invalid segment would not match the regex of the address route — the
            // tab would show a 404. A temporary bare address is taken then: the
            // preview of the current canvas matters more than an exact URL, and
            // the localStorage slot is picked up by that same address
            const formAddress = toPageAddress(formState.pagename, formState.urlPrefix);
            const address = isValidPageAddress(formAddress)
                ? formAddress
                : { pagename: `preview-${previewId}`, urlPrefix: null };
            // What travels into the snapshot is the address of the preview URL
            // rather than the raw fields of the form: by it the preview tab and the
            // middleware recognize the snapshot as their own
            const previewData: IPreviewStoredPage = {
                id: previewId,
                pagename: address.pagename,
                title: formState.title || t('bricks.publish.previewFallback'),
                description: formState.description || t('bricks.publish.previewFallback'),
                keywords: formState.keywords,
                published: formState.published,
                layout: formState.layout,
                backgroundColor: formState.backgroundColor,
                socialImage: formState.socialImage,
                urlPrefix: address.urlPrefix,
                subdomain: formState.subdomain,
                thumbnailUrl: null,
                viewportConfig: formState.viewportConfig ?? null,
                // The preview runs the page code: it is checked there before going live
                headCode: formState.headCode || null,
                bodyEndCode: formState.bodyEndCode || null,
                noindex: formState.noindex === true,
                createdAt: formState.createdAt,
                updatedAt: formState.updatedAt,
                schema,
                isPreview: true,
                storedAt: new Date().toISOString(),
            };

            // The write goes BEFORE the opening: the new tab reads the slot right
            // away, and the reverse order would show it the snapshot of the previous
            // preview. On a blocked tab the slot is left as it is — an earlier
            // preview tab may be reading it, and the next attempt overwrites it
            // anyway
            window.localStorage.setItem('bricks-preview-page', JSON.stringify(previewData));

            // A blocked tab is reported by the return value alone, and the error of
            // the form is deliberately left alone: it belongs to the publish panel and
            // is cleared by a write of the page, so a text put there would keep hanging
            // in the panel after a retry that did open. What to show is decided by the
            // caller, which has a toast for it
            return openPreviewTab(address) ? address : null;
        } catch (error) {
            console.error('[Publish Preview] Failed to create preview:', error);
            publishStore.generalError = t('bricks.publish.previewCreateFailed');

            return null;
        }
    }

    /**
     * The preview of a saved version of a page: opens the preview route with
     * `?version=`. The snapshot arrives from the server (the preview middleware
     * pulls the version by its id), so localStorage takes no part here at all —
     * there is one slot there, and a builder of the same page open alongside, or a
     * second preview, would overwrite the snapshot of the version.
     *
     * The address is taken from the CURRENT page rather than from the version — it
     * has to match the parameters of the `<previewPrefix>/<address>` route (the
     * page may have been renamed or moved under another prefix).
     *
     * @param address - The address of the current page.
     * @param versionId - The id of the saved version.
     * @returns The address of the opened preview, or null when the tab did not open.
     */
    function previewPageVersion(
        address: IBricksPageAddress,
        versionId: number
    ): IBricksPageAddress | null {
        return openPreviewTab(address, versionId) ? address : null;
    }

    return { previewCurrentPage, previewPageVersion, openPreviewTab };
}
