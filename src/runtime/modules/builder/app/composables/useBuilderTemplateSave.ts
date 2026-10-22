// #region Imports
// Types
import type { TBricksTemplateSummary } from '../../../common/types/templates';
import type { ITemplateSaveSource } from '../../templates/types/templates';
import type {
    IUseBuilderTemplateSaveOptions,
    IUseBuilderTemplateSaveReturn,
} from '../types/composables';

// Utils
import { toPageAddress } from '../../../common/utils/bricks/pageAddress';
import { getPublishedPagePath } from '../../../common/utils/bricks/routePaths';

// Vue
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Pinia
import { useComponentsStore } from '../../core/stores/components';
import { usePublishStore } from '../../publish/stores/publish';
// #endregion

/**
 * Saving the canvas as a template out of the builder (the third item of the split
 * button).
 *
 * The source is assembled on the spot, synchronously: what travels into a template
 * is what is on the canvas NOW, unsaved edits included — reading the page out of
 * the database here would be plainly wrong.
 *
 * The thumbnail is the frame of the last save of the page (the `thumbnailUrl` of
 * its row in the list): unsaved edits have no shot of their own, and shooting the
 * canvas on the spot would take one more upload endpoint and a key namespace of its
 * own. The window says so in a caption, so a divergence of the picture from the
 * content does not look like a breakage. A page that has never been saved has no
 * frame at all — the template will be left with a placeholder.
 *
 * @param options - The readiness of the session and the showing of a toast.
 * @returns The state of the template form and the request to open it.
 */
export function useBuilderTemplateSave(
    options: IUseBuilderTemplateSaveOptions
): IUseBuilderTemplateSaveReturn {
    // #region Data
    const { t } = useI18n();
    const componentsStore = useComponentsStore();
    const publishStore = usePublishStore();

    const source = ref<ITemplateSaveSource | null>(null);
    const isModalOpen = ref(false);
    /**
     * The mount latch of the form: the form itself is connected lazily, but without
     * a condition in the markup its chunk would travel out by the first render of
     * the builder. The latch is never lowered again — otherwise the component would
     * be recreated and would lose its leave animation.
     */
    const shouldMountModal = ref(false);
    // #endregion

    // #region Methods
    /**
     * Assembles the source out of the canvas and the publish form and opens the
     * template form.
     *
     * The session guard is here rather than at the caller: before readiness the
     * canvas has no schema yet, and the template would carry an empty canvas away —
     * the same rule as for the save of a page.
     */
    function requestFromCanvas(): void {
        if (!options.isSessionReady.value) {
            options.showToast(t('bricks.publish.session.saveBlocked'), 'error');
            return;
        }

        const schema = componentsStore.exportSchema();
        const formState = publishStore.currentFormState;
        const savedPage =
            publishStore.editingPageId === null
                ? null
                : (publishStore.getPageById(publishStore.editingPageId) ?? null);
        const label = formState.title || formState.pagename;

        source.value = {
            suggestedName: label,
            suggestedDescription: formState.description ?? '',
            schema,
            pageMeta: {
                layout: formState.layout || null,
                backgroundColor: formState.backgroundColor || null,
                viewportConfig: formState.viewportConfig ?? null,
            },
            thumbnailSourceUrl: savedPage?.thumbnailUrl ?? null,
            pageLabel: label,
            pageAddressPath: formState.pagename
                ? getPublishedPagePath(toPageAddress(formState.pagename, formState.urlPrefix))
                : '',
            blocksCount: schema.components.length,
            // `null` — the page is not in the database yet: the window will say
            // that what travels out is what is on the canvas alone
            pageUpdatedAt: savedPage?.updatedAt ?? null,
        };
        shouldMountModal.value = true;
        isModalOpen.value = true;
    }

    /**
     * Closes the form. The source stays until the next opening: `force-mount` holds
     * the window in the DOM until the end of the leave animation, and a cleared
     * source would empty the card of the page right under the leaving window.
     */
    function close(): void {
        isModalOpen.value = false;
    }

    /**
     * The template is saved: the form is closed and the fact is reported.
     *
     * @param template - The saved template.
     */
    function handleSaved(template: TBricksTemplateSummary): void {
        close();
        options.showToast(t('bricks.templates.toasts.saved', { name: template.name }), 'success');
    }
    // #endregion

    return {
        source: computed<ITemplateSaveSource | null>(() => source.value),
        isModalOpen: computed<boolean>(() => isModalOpen.value),
        shouldMountModal: computed<boolean>(() => shouldMountModal.value),
        requestFromCanvas,
        close,
        handleSaved,
    };
}
