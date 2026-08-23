import type { Composer } from 'vue-i18n';
import { useNuxtApp } from '#imports';
import type { IBricksSchema } from '../../../common/types/brick';
import type { IPreviewStoredPage } from '../../../common/types/bricks-api';
import type { IBricksPageAddress } from '../../../common/types/pageAddress';
import type { IUsePublishPreviewReturn } from '../types/composables';
import { useBricksRoutePaths } from '../../../common/composables/useBricksRoutePaths';
import { isValidPageAddress, toPageAddress } from '../../../common/utils/bricks/pageAddress';
import { usePublishStore } from '../stores/publish';

/**
 * Translates a key through the global i18n (this composable is called outside a
 * setup context too). `$i18n` is resolved lazily on every call — safe under any
 * order of the plugins.
 */
function t(key: string): string {
    const i18n = useNuxtApp().$i18n as Composer | undefined;
    return i18n ? i18n.t(key) : key;
}

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
     * Creates a preview of the current landing out of the form state of the
     * publish store.
     *
     * @param schema - Landing schema.
     * @returns The address of the opened preview, or null on an error.
     */
    function previewCurrentPage(schema: IBricksSchema): IBricksPageAddress | null {
        try {
            const formState = publishStore.currentFormState;
            // The address of the form fits the preview URL only whole and only
            // when valid: a preview is opened out of an invalid form too, and an
            // invalid segment would not match the regex of the address route — the
            // tab would show a 404. A temporary bare address is taken then: the
            // preview of the current canvas matters more than an exact URL, and
            // the localStorage slot is picked up by that same address
            const formAddress = toPageAddress(formState.pagename, formState.urlPrefix);
            const address = isValidPageAddress(formAddress)
                ? formAddress
                : { pagename: `preview-${Date.now()}`, urlPrefix: null };
            const tempPageId = `preview-${Date.now()}`;
            // What travels into the snapshot is the address of the preview URL
            // rather than the raw fields of the form: by it the preview tab and the
            // middleware recognize the snapshot as their own
            const previewData: IPreviewStoredPage = {
                id: Number(tempPageId.replace('preview-', '')),
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
                createdAt: formState.createdAt,
                updatedAt: formState.updatedAt,
                schema,
                isPreview: true,
                storedAt: new Date().toISOString(),
            };

            if (typeof window === 'undefined') {
                console.warn('[Publish Preview] previewCurrentPage: window is not available');
                return null;
            }

            window.localStorage.setItem('bricks-preview-page', JSON.stringify(previewData));
            window.open(generatePreviewUrl(address), '_blank');
            return address;
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
        if (typeof window === 'undefined') {
            console.warn('[Publish Preview] previewPageVersion: window is not available');
            return null;
        }

        // A popup blocker returns null — without the check the refusal would be
        // a silent one
        return window.open(generatePreviewUrl(address, versionId), '_blank') ? address : null;
    }

    return { previewCurrentPage, previewPageVersion, generatePreviewUrl };
}
