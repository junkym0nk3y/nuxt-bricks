/**
 * Creating and deleting the categories of the media library, along with the state of
 * their confirmation.
 *
 * Taken out of the gallery modal: that one was a controller over five surfaces even
 * without this, and with the categories it was outgrowing the ceiling of an SFC.
 * Collected here is everything only this scenario needs — the "a write is running"
 * flags, the tab picked for deletion and the text of the confirmation; the modal
 * itself gets finished handlers.
 */

// #region Imports
// Types
import type { IMediaCategory } from '../../../common/types/media';
import type { IMediaCategoryActionsOptions, IMediaCategoryActions } from '../types/composables';

// Utils
import { resolveMediaCategoryLabelBySlug } from '../utils/categoryLabels';
import { getBricksErrorMessage } from '../../../common/utils/main';
import { isRequestTimeoutError } from '../../../common/utils/apiRequestPolicy';

// Vue
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Pinia
import { useMediaCategoriesStore } from '../stores/mediaCategories';

// Composables
import { useBuilderPermissions } from '../../core/composables/useBuilderPermissions';
// #endregion

/**
 * Assembles the actions over the categories of the media library.
 *
 * @param options - Access to the file counts, the filter reset and the error toast.
 * @returns State and handlers for the row of tabs and for the delete confirmation.
 */
export function useMediaCategoryActions(
    options: IMediaCategoryActionsOptions
): IMediaCategoryActions {
    const { t } = useI18n();
    const categoriesStore = useMediaCategoriesStore();
    // The rights are checked here too, not by hiding the buttons alone: categories
    // are a write (creating one) and a deletion (an admin), and in time the gallery
    // will be entered from more than the toolbar
    const { canEdit, canDelete } = useBuilderPermissions();
    const isCreatingCategory = ref(false);
    const categoryPendingDeletion = ref<string | null>(null);
    const isDeletingCategory = ref(false);

    const categories = computed<IMediaCategory[]>(() => categoriesStore.categories);

    const deleteCategoryTitle = computed<string>(() =>
        categoryPendingDeletion.value
            ? t('bricks.media.categoryDeleteTitle', {
                  name: resolveMediaCategoryLabelBySlug(
                      categoryPendingDeletion.value,
                      categories.value
                  ),
              })
            : ''
    );

    const deleteCategoryDescription = computed<string>(() => {
        const slug = categoryPendingDeletion.value;

        if (!slug) {
            return '';
        }

        return t('bricks.media.categoryDeleteDescription', {
            count: options.resolveCategoryCount(slug),
        });
    });

    /**
     * Creates a category; a refusal reaches the user as a toast.
     *
     * @param label - The caption the user typed; the slug is the server's to compute.
     */
    async function handleCreateCategory(label: string): Promise<void> {
        if (!canEdit.value) {
            return;
        }

        isCreatingCategory.value = true;

        try {
            await categoriesStore.createCategory(label);
        } catch (error: unknown) {
            options.onError(getBricksErrorMessage(error, t('bricks.media.categoryCreateFailed')));
        } finally {
            isCreatingCategory.value = false;
        }
    }

    /**
     * Opens the confirmation of a category deletion.
     *
     * @param slug - The category picked for deletion.
     */
    function handleRequestCategoryDelete(slug: string): void {
        categoryPendingDeletion.value = slug;
    }

    /** Closes the confirmation of a category deletion */
    function handleCloseCategoryDelete(): void {
        categoryPendingDeletion.value = null;
    }

    /**
     * Confirms the deletion of a category.
     *
     * The active filter is dropped by the caller: it would point at a category that
     * is gone, and the grid would be left demonstratively empty. A break by the
     * waiting ceiling closes the confirmation — the outcome is unknown, and a repeat
     * of a deletion that did go through answers 404.
     */
    async function handleConfirmCategoryDelete(): Promise<void> {
        const slug = categoryPendingDeletion.value;

        if (!slug || !canDelete.value) {
            return;
        }

        isDeletingCategory.value = true;

        try {
            await categoriesStore.deleteCategory(slug);
            options.onCategoryDeleted(slug);
            categoryPendingDeletion.value = null;
        } catch (error: unknown) {
            options.onError(getBricksErrorMessage(error, t('bricks.media.categoryDeleteFailed')));

            if (isRequestTimeoutError(error)) {
                categoryPendingDeletion.value = null;
            }
        } finally {
            isDeletingCategory.value = false;
        }
    }

    /** Drops the confirmation when the gallery closes */
    function resetCategoryActions(): void {
        categoryPendingDeletion.value = null;
    }

    return {
        categories,
        isCreatingCategory,
        categoryPendingDeletion,
        isDeletingCategory,
        deleteCategoryTitle,
        deleteCategoryDescription,
        handleCreateCategory,
        handleRequestCategoryDelete,
        handleCloseCategoryDelete,
        handleConfirmCategoryDelete,
        resetCategoryActions,
    };
}
