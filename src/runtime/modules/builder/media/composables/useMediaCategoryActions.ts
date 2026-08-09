/**
 * Создание и удаление категорий медиатеки вместе с их состоянием подтверждения.
 *
 * Вынесено из модалки галереи: та и без этого была контроллером на пять
 * поверхностей, а с категориями перерастала потолок SFC. Здесь собрано всё, что
 * нужно только этому сценарию — флаги «идёт запись», выбранный к удалению чип и
 * текст подтверждения; сама модалка получает готовые обработчики.
 */

// #region Imports
// Types
import type { IMediaCategory } from '../../../common/types/media';
import type { IMediaCategoryActionsOptions, IMediaCategoryActions } from '../types/media';

// Utils
import { resolveMediaCategoryLabelBySlug } from '../utils/categoryLabels';
import { getBricksErrorMessage } from '../../../common/utils/main';
import { isRequestTimeoutError } from '../../../common/utils/apiRequestPolicy';

// Vue
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Pinia
import { useMediaCategoriesStore } from '../stores/mediaCategories';
// #endregion

/**
 * Собирает действия над категориями медиатеки.
 *
 * @param options - Доступ к списку категорий, сброс фильтра и показ ошибки.
 * @returns Состояние и обработчики для ряда чипов и подтверждения удаления.
 */
export function useMediaCategoryActions(
    options: IMediaCategoryActionsOptions
): IMediaCategoryActions {
    const { t } = useI18n();
    const categoriesStore = useMediaCategoriesStore();
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
     * Создаёт категорию; отказ доходит до пользователя тостом.
     *
     * @param label - Подпись, введённая пользователем; slug считает сервер.
     */
    async function handleCreateCategory(label: string): Promise<void> {
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
     * Открывает подтверждение удаления категории.
     *
     * @param slug - Категория, выбранная к удалению.
     */
    function handleRequestCategoryDelete(slug: string): void {
        categoryPendingDeletion.value = slug;
    }

    /** Закрывает подтверждение удаления категории. */
    function handleCloseCategoryDelete(): void {
        categoryPendingDeletion.value = null;
    }

    /**
     * Подтверждает удаление категории.
     *
     * Активный фильтр сбрасывается вызывающим: он указывал бы на категорию,
     * которой больше нет, и сетка осталась бы демонстративно пустой. Обрыв по
     * потолку ожидания закрывает подтверждение — исход неизвестен, а повтор
     * получил бы 404.
     */
    async function handleConfirmCategoryDelete(): Promise<void> {
        const slug = categoryPendingDeletion.value;

        if (!slug) {
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

    /** Снимает подтверждение при закрытии галереи. */
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
