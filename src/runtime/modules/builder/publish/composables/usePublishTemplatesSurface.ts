// #region Imports
// Types
import type { TPublishedPageSummary } from '../../../common/types/bricks-api';
import type { TBricksTemplateSummary } from '../../../common/types/templates';
import type { ITemplateSaveSource } from '../../templates/types/templates';
import type { TMediaLightboxItem } from '../../media/types/media';
import type { IUsePublishTemplateSurfaceOptions } from '../types/composables';

// Utils
import { fetchPageRequest } from '../utils/publishApi';
import { toPageAddress } from '../../../common/utils/bricks/pageAddress';
import { getPublishedPagePath } from '../../../common/utils/bricks/routePaths';

// Vue
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
// #endregion

/**
 * The templates surface on the dashboard: preparing a source out of a row of the
 * page list, the template pre-picked for the creation form and the snapshot for the
 * lightbox.
 *
 * Lives in the publish domain rather than in the templates one: saving a page as a
 * template takes its SCHEMA, and a list summary carries no schema — it has to be
 * read by a point lookup (`GET /api/bricks/:id`), that is, by knowing about pages.
 * The opposite direction is forbidden by the layer rules: the templates domain
 * knows nothing about pages and receives ready content as a value.
 *
 * The pre-pick of a template and the lightbox snapshot are here too — state that
 * would otherwise sit in the dashboard host as a third machine next to the pages
 * and the accounts.
 *
 * @param options - Showing the toast about a refused read.
 * @returns The state of the template form, the pre-picked source and the lightbox
 * snapshot.
 */
export function usePublishTemplatesSurface(options: IUsePublishTemplateSurfaceOptions) {
    // #region Data
    const { t } = useI18n();

    const source = ref<ITemplateSaveSource | null>(null);
    const isModalOpen = ref(false);
    /** The page whose schema is being read right now; `null` — no read is running */
    const preparingPageId = ref<string | null>(null);
    /**
     * The template picked as the source of the creation form to be opened; `null` —
     * none is picked.
     */
    const createTemplate = ref<TBricksTemplateSummary | null>(null);
    /** The template snapshot open in the lightbox; `null` — it is closed */
    const previewItem = ref<TMediaLightboxItem | null>(null);

    /**
     * The generation of the preparation: reading a schema is asynchronous, and in
     * that time a person has time to hit the action of another row. Without the
     * counter whichever answer arrived first would open the form carrying the content
     * of a page other than the one picked last.
     */
    let preparationGeneration = 0;
    // #endregion

    // #region Methods
    /**
     * Reads the page by a point lookup and opens the template save form.
     *
     * A second click on another row is NOT turned down: the busy state is visible
     * only on its own row, while the generation below implements last-click-wins
     * already — an early `return` used to make the buttons of the other rows mute
     * even though they look active. The price is two parallel GETs on a fast
     * switch-over; in exchange exactly the last pick is what opens.
     *
     * The source is assembled WHOLE out of the row that was read rather than half
     * out of it and half out of the list summary: the list may have fallen behind
     * (another editor saved the page), and the template would come out of two
     * generations of data — a fresh schema with an old appearance and somebody
     * else's snapshot.
     *
     * @param page - The source page from the list; only its `id` is taken from it.
     */
    async function requestFromPage(page: TPublishedPageSummary): Promise<void> {
        preparationGeneration += 1;

        const generation = preparationGeneration;

        preparingPageId.value = String(page.id);

        try {
            const fullPage = await fetchPageRequest(page.id);

            if (generation !== preparationGeneration) {
                return;
            }

            const label = fullPage.title || fullPage.pagename;

            source.value = {
                suggestedName: label,
                suggestedDescription: fullPage.description ?? '',
                schema: fullPage.schema,
                pageMeta: {
                    layout: fullPage.layout,
                    backgroundColor: fullPage.backgroundColor,
                    viewportConfig: fullPage.viewportConfig,
                },
                // The snapshot of the page: the server will copy it into a file of
                // the template's own
                thumbnailSourceUrl: fullPage.thumbnailUrl,
                pageLabel: label,
                pageAddressPath: getPublishedPagePath(
                    toPageAddress(fullPage.pagename, fullPage.urlPrefix)
                ),
                blocksCount: fullPage.schema.components.length,
                pageUpdatedAt: fullPage.updatedAt || fullPage.createdAt,
            };
            isModalOpen.value = true;
        } catch (error: unknown) {
            if (generation !== preparationGeneration) {
                return;
            }

            console.error('[Publish] Failed to read the page schema for a template:', error);
            options.onNotify(t('bricks.templates.errors.sourceReadFailed'), 'error');
        } finally {
            if (generation === preparationGeneration) {
                preparingPageId.value = null;
            }
        }
    }

    /**
     * Closes the form. The source stays until the next opening: `force-mount` keeps
     * the modal in the DOM until the leave animation ends, and a source taken away
     * would empty the page card right under the departing window.
     */
    function close(): void {
        isModalOpen.value = false;
    }

    /**
     * Makes the template the source of the next page creation form to be opened.
     *
     * @param template - The source template.
     */
    function selectForCreate(template: TBricksTemplateSummary): void {
        createTemplate.value = template;
    }

    /**
     * Drops the pre-picked source: the form was opened by the header button rather
     * than by a card.
     */
    function clearCreateSelection(): void {
        createTemplate.value = null;
    }

    /**
     * Prepares the snapshot of a template for the lightbox; a template with no
     * snapshot does not open.
     *
     * @param template - The template.
     */
    function previewThumbnail(template: TBricksTemplateSummary): void {
        if (!template.thumbnailUrl) {
            return;
        }

        previewItem.value = {
            url: template.thumbnailUrl,
            mimeType: 'image/webp',
            alt: template.name,
            filename: `${template.name}.webp`,
        };
    }

    /**
     * Closes the template lightbox.
     */
    function closePreview(): void {
        previewItem.value = null;
    }
    // #endregion

    return {
        source: computed<ITemplateSaveSource | null>(() => source.value),
        isModalOpen: computed<boolean>(() => isModalOpen.value),
        preparingPageId: computed<string | null>(() => preparingPageId.value),
        createTemplate: computed<TBricksTemplateSummary | null>(() => createTemplate.value),
        previewItem: computed<TMediaLightboxItem | null>(() => previewItem.value),
        requestFromPage,
        close,
        selectForCreate,
        clearCreateSelection,
        previewThumbnail,
        closePreview,
    };
}
