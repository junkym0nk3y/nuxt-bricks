// #region Imports
// Types
import type { TBrickDemoValues } from '../../../common/types/index';
import type { IBrickUiCommonProp } from '../../../ui/types/common';
import type { IMediaCategorySelect, IMediaCategorySelectOptions } from '../types/composables';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
// #endregion

/**
 * The category selector of a file: the options of the list, the value the select
 * shows and the handler of a change.
 *
 * One mechanism for two surfaces — the meta panel of the gallery modal and the
 * details panel of the dashboard section. A controller of its own rather than a part
 * of `useMediaMetaDrafts`: the name and the alt are drafts committed when focus
 * leaves, while the category travels to the server the moment it is picked.
 *
 * The right to edit is not asked about here: whether the field is disabled is the
 * business of the surface that draws it, and the write itself is guarded by its
 * owner.
 *
 * @param options - The file, the list of categories and the taker of the change.
 * @returns The options of the select, its value and the handler of a change.
 */
export function useMediaCategorySelect(options: IMediaCategorySelectOptions): IMediaCategorySelect {
    // #region Data
    const { t } = useI18n();
    // #endregion

    // #region Computed
    /**
     * "No category" comes first: a category is optional, and taking one off a file can
     * be done from here only. The empty string is the contract of `BricksSelect` for
     * an empty value (inside reka it is swapped for a sentinel, an item with
     * `value=''` breaking the popup).
     */
    const categoryOptions = computed<IBrickUiCommonProp[]>(() => [
        { label: t('bricks.media.noCategory'), value: '' },
        ...options.categories().map((category) => ({
            label: category.label,
            value: category.slug,
        })),
    ]);

    const categoryFacets = computed<TBrickDemoValues[]>(() =>
        categoryOptions.value.map((option) => option.value)
    );

    const selectedCategory = computed<string>(() => options.item()?.category ?? '');
    // #endregion

    // #region Methods
    /**
     * Takes a change of the category of the file.
     *
     * There is no need to put the value back the way the native `<select>` did:
     * `BricksSelect` is controlled and shows what arrived in its prop — on a refusal
     * of the server the source does not change, and the selector stays on the former
     * category by itself.
     *
     * With no file there is nothing to change: a selector leaving the screen along
     * with the file it belonged to must not send a change after it.
     *
     * @param value - The value reported by the select.
     */
    function handleCategoryChange(value: TBrickDemoValues | null): void {
        if (!options.item() || typeof value !== 'string' || value === selectedCategory.value) {
            return;
        }

        // An empty string out of the selector means "no category", not an empty slug
        options.onChange(value === '' ? null : value);
    }
    // #endregion

    return { categoryOptions, categoryFacets, selectedCategory, handleCategoryChange };
}
