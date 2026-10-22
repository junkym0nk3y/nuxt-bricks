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
    const { openPreviewTab } = usePublishPreview();

    // The busy registries of both writes of a row. Sets rather than one identifier
    // apiece: the operations of DIFFERENT pages are independent, and a shared flag
    // would silently drop a click on the control of another row — the controls are
    // drawn per page, so a refusal they cannot express is a refusal in silence
    const duplicatingPageIds = ref<Set<string>>(new Set());
    const togglingPageIds = ref<Set<string>>(new Set());
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
     * ONE toggle per PAGE (`togglingPageIds`): two quick clicks used to send two
     * parallel last-write-wins PATCHes, and `syncPageInList` applied the answer of
     * each — the outcome depended on the order the answers arrived in rather than on
     * the last intention of the person. Worse was the refusal branch: it restored
     * the value it had taken off at ITS OWN start, so a late refusal was able to
     * wipe out the already applied result of a fresher request.
     *
     * Per page rather than one at a time for the whole dashboard: toggles of
     * different pages are independent writes with rollbacks of their own (see the
     * registries above).
     *
     * The rollback is conditional on the IDENTITY of the optimistic record still
     * being in the list. A comparison of the flag alone is not enough: while the
     * PATCH is in flight the list may receive a fresh record of the server — a save
     * of the same page, a refresh of the list, or the re-read `toPageWriteError`
     * starts after an abort by the timeout — and a fresh answer carrying the same
     * value would be rolled back as if it were our optimistic write.
     *
     * No `expectedRevision` in the payload deliberately: a precondition over the row
     * would refuse the toggle after ANY change of the page by another editor —
     * a title, the content — while this write touches the publication flag alone.
     * The defect being closed here is the race of two clicks of ONE person, and that
     * is what the busy set closes.
     *
     * @param page - The page.
     * @param published - The new publication flag.
     */
    async function togglePublished(page: TPublishedPageSummary, published: boolean): Promise<void> {
        const pageKey = String(page.id);

        if (togglingPageIds.value.has(pageKey)) {
            return;
        }

        const target = publishStore.getPageById(page.id);

        if (!target || target.published === published) {
            return;
        }

        const previousPublished = target.published;
        const optimistic = publishStore.setPagePublishedLocally(page.id, published);

        togglingPageIds.value.add(pageKey);

        try {
            await publishStore.patchPage(page.id, { published });
        } catch (error: unknown) {
            if (optimistic && publishStore.getPageById(page.id) === optimistic) {
                publishStore.setPagePublishedLocally(page.id, previousPublished);
            }

            options.onNotify(
                error instanceof Error
                    ? error.message
                    : t('bricks.publish.dashboard.details.toasts.statusFailed'),
                'error'
            );
        } finally {
            togglingPageIds.value.delete(pageKey);
        }
    }

    /**
     * Duplicates a page: the copy is created as a draft carrying a unique name.
     *
     * One copy per SOURCE page: a second click on the same row would breed a second
     * copy of one page, while copies of different pages are independent — the name
     * of a copy is picked inside the address of its own source, so two of them
     * cannot claim one address, and no shared state stands between them (unlike the
     * write of the CURRENT landing, which is held by the `activeWrites` registry).
     *
     * @param page - The source page.
     */
    async function duplicatePage(page: TPublishedPageSummary): Promise<void> {
        const pageKey = String(page.id);

        if (duplicatingPageIds.value.has(pageKey)) {
            return;
        }

        duplicatingPageIds.value.add(pageKey);

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
            duplicatingPageIds.value.delete(pageKey);
        }
    }

    /**
     * Opens the preview of the page in a new tab.
     *
     * A tab blocked by a popup blocker is reported by a toast: a row of the list has
     * no other way to say it, and silence here reads as a control that does nothing.
     *
     * @param page - The page.
     */
    function previewPage(page: TPublishedPageSummary): void {
        if (!openPreviewTab(toPageAddress(page.pagename, page.urlPrefix))) {
            options.onNotify(t('bricks.publish.toasts.previewFailed'), 'error');
        }
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
        duplicatingPageIds,
        togglingPageIds,
        thumbnailPreviewItem,
        togglePublished,
        duplicatePage,
        previewPage,
        previewThumbnail,
        closeThumbnailPreview,
    };
}
