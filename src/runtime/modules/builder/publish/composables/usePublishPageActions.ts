// #region Imports
// Types
import type { TPublishedPageSummary } from '../../../common/types/bricks-api';
import type { TMediaLightboxItem } from '../../media/types/media';
import type {
    IUsePublishPageActionsOptions,
    IUsePublishPageActionsReturn,
} from '../types/composables';

// Utils
import { toPageAddress } from '../../../common/utils/bricks/pageAddress';

// Vue
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Pinia
import { usePublishStore } from '../stores/publish';

// Composables
import { usePublishPreview } from './usePublishPreview';
// #endregion

/**
 * The actions on a page that need no confirmation: the publication, the copy, the
 * preview of the page and the preview of its thumbnail.
 *
 * Taken out of the dashboard host not "for tidiness": the host had outgrown the
 * 500-line ceiling, while these four actions have nothing in common except that
 * all of them belong to a row of the list — that is, they come out as one group
 * and leave no remainder. The operations that ask for a confirmation (deleting a
 * page, rolling back to a version) live in composables of their own following the
 * same pattern.
 *
 * @param options - Showing the toasts (owned by the dashboard).
 * @returns The copying state, the thumbnail lightbox and the actions themselves.
 */
export function usePublishPageActions(
    options: IUsePublishPageActionsOptions
): IUsePublishPageActionsReturn {
    // #region Data
    const { t } = useI18n();
    const publishStore = usePublishStore();
    const { generatePreviewUrl } = usePublishPreview();

    const duplicatingPageId = ref<string | null>(null);
    const thumbnailPreviewItem = ref<TMediaLightboxItem | null>(null);
    // #endregion

    // #region Methods
    /**
     * Optimistically toggles the publication status; on a refusal brings the
     * previous one back.
     *
     * Optimistically, unlike the operations on accounts: a person clicks the
     * publication switch and looks at the result at once, and a delay of one round
     * trip to the server would read as a button that does not latch. The price is
     * the rollback on a refusal, and it is possible because the previous value is
     * known for certain.
     *
     * @param page - The page.
     * @param published - The new publication flag.
     */
    async function togglePublished(page: TPublishedPageSummary, published: boolean): Promise<void> {
        const target = publishStore.getPageById(page.id);

        if (!target || target.published === published) {
            return;
        }

        const previousPublished = target.published;
        target.published = published;

        try {
            await publishStore.patchPage(page.id, { published });
        } catch (error: unknown) {
            const current = publishStore.getPageById(page.id);

            if (current) {
                current.published = previousPublished;
            }

            options.onNotify(
                error instanceof Error
                    ? error.message
                    : t('bricks.publish.dashboard.details.toasts.statusFailed'),
                'error'
            );
        }
    }

    /**
     * Duplicates a page: the copy is created as a draft carrying a unique name.
     *
     * @param page - The source page.
     */
    async function duplicatePage(page: TPublishedPageSummary): Promise<void> {
        if (duplicatingPageId.value !== null) {
            return;
        }

        duplicatingPageId.value = String(page.id);

        try {
            await publishStore.duplicatePage(page.id);
            options.onNotify(t('bricks.publish.dashboard.toasts.duplicated'), 'success');
        } catch (error: unknown) {
            options.onNotify(
                error instanceof Error
                    ? error.message
                    : t('bricks.publish.dashboard.toasts.duplicateFailed'),
                'error'
            );
        } finally {
            duplicatingPageId.value = null;
        }
    }

    /**
     * Opens the preview of the page in a new tab.
     *
     * @param page - The page.
     */
    function previewPage(page: TPublishedPageSummary): void {
        window.open(generatePreviewUrl(toPageAddress(page.pagename, page.urlPrefix)), '_blank');
    }

    /**
     * Opens the thumbnail of the page in the lightbox of the media gallery.
     *
     * @param page - A page carrying a snapshot.
     */
    function previewThumbnail(page: TPublishedPageSummary): void {
        if (!page.thumbnailUrl) {
            return;
        }

        thumbnailPreviewItem.value = {
            url: page.thumbnailUrl,
            mimeType: 'image/webp',
            alt: page.title || page.pagename,
            filename: `${page.pagename}.webp`,
        };
    }

    /**
     * Closes the thumbnail lightbox.
     */
    function closeThumbnailPreview(): void {
        thumbnailPreviewItem.value = null;
    }
    // #endregion

    return {
        duplicatingPageId,
        thumbnailPreviewItem,
        togglePublished,
        duplicatePage,
        previewPage,
        previewThumbnail,
        closeThumbnailPreview,
    };
}
