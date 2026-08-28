<script setup lang="ts">
/**
 * @description The row of the media library's category tabs: the kit's tab bar in the
 * underline style, plus a delete button handed to it through the `item-action` slot.
 *
 * The row used to be assembled straight on reka's `ToggleGroup` with a copy of the
 * underline styles, because a delete button cannot live inside a `ToggleGroupItem` — a
 * button within a button — and a second group item would change the filter on a click
 * on the cross. The kit now owns that place itself: the tab and the action stand in one
 * wrapper, and the underline goes under both. What is left here is the list of tabs and
 * what goes into the action.
 *
 * The crosses show only in the managing mode (`isManaging`) and only for a role allowed
 * to delete (creating a category stays with the editor; the rights are read in
 * `useMediaCategoryActions`). Permanent crosses would turn a row of filters into a row
 * of delete buttons, while showing one "on the selected tab only" hid the deletion
 * behind a guess: to find out that a category can be deleted at all, one first had to
 * select it. `hasAction` follows the same condition, so a tab reserves room for a cross
 * exactly while a cross is drawn on it.
 *
 * The counter is drawn only for the non-empty categories: a "· 0" on every category
 * created but not filled yet is noise in the row rather than information. The overall
 * count is the exception — a zero there is the answer to "how many files are in the
 * library", and it is hidden only while the number is unknown.
 *
 * The delete button is taken in the `sm` size of the kit: next to a 1.2rem caption the
 * standard 3.2rem would read as a separate button stuck onto the tab rather than as a
 * part of it. From the outside only its place in the row is set — the side, the radius
 * and the destructive tone arrive from the kit button.
 */

// #region Imports
// Types
import type { IBricksTabItem } from '../../../ui/base/tabs/types.d.ts';
import type {
    IMediaGalleryCategoryTabsProps,
    IMediaGalleryCategoryTabsEmits,
} from '../types/media';

// Utils
import { ALL_MEDIA_CATEGORIES_FILTER } from '../../../common/constants/mediaCategories';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useBuilderPermissions } from '../../core/composables/useBuilderPermissions';

// Components
import BricksIconButton from '../../../ui/base/icon-button/BricksIconButton.vue';
import BricksTabBar from '../../../ui/base/tabs/BricksTabBar.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IMediaGalleryCategoryTabsProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IMediaGalleryCategoryTabsEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const { canDelete } = useBuilderPermissions();
// #endregion

// #region Computed
/** Whether the crosses are drawn at all: the mode is on and the role allows deleting */
const isDeletable = computed<boolean>(() => props.isManaging && canDelete.value);

const tabItems = computed<IBricksTabItem[]>(() => [
    {
        value: ALL_MEDIA_CATEGORIES_FILTER,
        label: t('bricks.media.categories.all'),
        count: props.totalCount ?? undefined,
    },
    ...props.categories.map((category) => ({
        value: category.slug,
        label: category.label,
        count: props.categoryCounts[category.slug] || undefined,
        hasAction: isDeletable.value,
    })),
]);
// #endregion

// #region Methods
/**
 * Hands the choice upward. The bar itself already cuts off a clearing of the selection
 * and a repeat of the current value, so what arrives here is always a real change.
 *
 * @param value - The value of the tab that was pressed.
 */
function handleValueChange(value: string): void {
    emit('update:modelValue', value);
}

/**
 * Emits the request to delete a category.
 *
 * @param slug - The category being deleted.
 */
function handleDelete(slug: string): void {
    emit('delete-category', slug);
}
// #endregion
</script>

<template>
    <BricksTabBar
        :model-value="props.modelValue"
        :items="tabItems"
        variant="underline"
        size="sm"
        wrap
        :group-label="t('bricks.media.categoryFilterLabel')"
        @update:model-value="handleValueChange"
    >
        <template #item-action="{ item }">
            <Transition name="bricks-fade-fast">
                <BricksIconButton
                    v-if="item.hasAction"
                    icon="ta:outline-x"
                    :label="t('bricks.media.categoryDelete', { name: item.label })"
                    variant="ghost"
                    size="sm"
                    danger
                    tooltip-side="top"
                    @click="handleDelete(item.value)"
                />
            </Transition>
        </template>
    </BricksTabBar>
</template>
