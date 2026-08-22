<script setup lang="ts">
/**
 * @description The row of the media library's category tabs, in the underline style.
 * A tab is composite: the caption with the counter is a `ToggleGroupItem`, and the
 * delete button is its neighbor inside a shared wrapper — the wrapper being what
 * carries the underline of the selected one.
 *
 * Why not `BricksTabBar`: it renders `items[]` itself, and a delete button cannot be
 * put inside a `ToggleGroupItem` — that is a button within a button, a nesting of
 * interactive elements that is not allowed. Standing them side by side within one
 * `ToggleGroupItem` does not work either: any item of the group gets selected and emits
 * `update:modelValue`, so a click on the cross would change the filter. Hence the row
 * is assembled here straight on reka's `ToggleGroup` — the keyboard, the roving
 * tabindex and the semantics of the group stay the library's, while the wrapper and
 * the styles stay ours. The values of the styles repeat `BricksTabBarItem._underline`: the row has
 * to read the same way the tab bars of the kit do everywhere else in the builder.
 *
 * The crosses show only in the managing mode (`isManaging`), only on the categories of
 * the user, and only for a role allowed to delete (creating a category stays with the
 * editor; the rights are read in `useMediaCategoryActions`). Permanent crosses would
 * turn a row of filters into a row of delete buttons, while showing one "on the
 * selected tab only" hid the deletion behind a guess: to find out that a category can
 * be deleted at all, one first had to select it. The counter is drawn only for the
 * non-empty ones: a "· 0" on every category created but not filled yet is noise in the
 * row rather than information.
 *
 * Decisions held by the style section. The underline is drawn on the wrapper and not on
 * the `ToggleGroupItem` itself: on a tab with a cross it would otherwise break off
 * halfway — under the caption but not under the cross. The selected state is put by
 * reka on the item, so the wrapper reads it through `:has` — the alternative would be
 * duplicating `modelValue` with a second class. On a tab with a cross the right padding
 * of the caption is taken off, otherwise 1.2rem of padding piles up between the caption
 * and the cross and the tab falls apart. The caption keeps the values of
 * `BricksTabBar variant="underline" size="sm"` deliberately — the same 3.2rem box, the
 * same `0 1.2rem` padding, the same 1.2rem/500 type and the same 0.2rem bar through
 * `scaleX`; the copy has already managed to drift on the gap and on the color of the
 * counter, and that has been put right. The delete button is taken in the `sm` size of
 * the kit: next to a 1.2rem caption the standard 3.2rem would read as a separate button
 * stuck onto the tab rather than as a part of it. From the outside only its place in
 * the row is set — the side, the radius and the destructive tone arrive from the kit
 * button, and an external class lands on the wrapper of the tooltip, from where rules
 * of appearance never reach the button itself.
 */

// #region Imports
// Types
import type {
    IMediaGalleryCategoryTabsProps,
    IMediaGalleryCategoryTabsEmits,
} from '../types/media';

// Utils
import { ALL_MEDIA_CATEGORIES_FILTER } from '../../../common/constants/mediaCategories';

// Vue
import { useI18n } from 'vue-i18n';

// Composables
import { useBuilderPermissions } from '../../core/composables/useBuilderPermissions';

// Reka UI
import { ToggleGroupItem, ToggleGroupRoot } from 'reka-ui';

// Components
import BricksIconButton from '../../../ui/base/icon-button/BricksIconButton.vue';
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
const allFilterValue = ALL_MEDIA_CATEGORIES_FILTER;
// #endregion

// #region Methods
/**
 * Hands the choice upward, cutting off the two cases in which the group reports an
 * event while the choice does not change: `undefined` (a repeated click on the selected
 * one — `ToggleGroup` counts that as a clearing, and the filter cannot be empty) and
 * the very same value.
 *
 * @param value - The value of the tab that was pressed; on a clearing it arrives empty.
 */
function handleValueChange(value: unknown): void {
    if (typeof value !== 'string' || value === props.modelValue) {
        return;
    }

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
    <ToggleGroupRoot
        type="single"
        :class="$style.BuilderMediaGalleryCategoryTabs"
        :model-value="props.modelValue"
        :aria-label="t('bricks.media.categoryFilterLabel')"
        @update:model-value="handleValueChange"
    >
        <div :class="$style.tab">
            <ToggleGroupItem :class="$style.label" :value="allFilterValue">
                <span>{{ t('bricks.media.categories.all') }}</span>
                <span v-if="props.totalCount !== null" :class="$style.count">
                    · {{ props.totalCount }}
                </span>
            </ToggleGroupItem>
        </div>

        <div
            v-for="category in props.categories"
            :key="category.slug"
            :class="[$style.tab, { [$style._deletable]: props.isManaging }]"
        >
            <ToggleGroupItem :class="$style.label" :value="category.slug">
                <span>{{ category.label }}</span>
                <span v-if="props.categoryCounts[category.slug]" :class="$style.count">
                    · {{ props.categoryCounts[category.slug] }}
                </span>
            </ToggleGroupItem>

            <Transition name="bricks-fade-fast">
                <BricksIconButton
                    v-if="props.isManaging && canDelete"
                    :class="$style.remove"
                    icon="ta:outline-x"
                    :label="t('bricks.media.categoryDelete', { name: category.label })"
                    variant="ghost"
                    size="sm"
                    danger
                    tooltip-side="top"
                    @click="handleDelete(category.slug)"
                />
            </Transition>
        </div>
    </ToggleGroupRoot>
</template>

<style module lang="scss">
.BuilderMediaGalleryCategoryTabs {
    display: flex;
    align-items: flex-end;
    flex-wrap: wrap;
    gap: 0.8rem;
}

.tab {
    position: relative;
    display: inline-flex;
    align-items: center;
    min-height: 3.2rem;

    &:after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        width: 100%;
        height: 0.2rem;
        background: var(--bricks-primary);
        transform: scaleX(0);
        transform-origin: left center;
        transition: transform var(--bricks-default-transition);
    }

    &:has(.label[data-state='on']) {
        &:after {
            transform: scaleX(1);
        }

        .label {
            color: var(--bricks-primary);
        }

        .count {
            color: var(--bricks-primary);
        }
    }

    &._deletable .label {
        padding-right: 0.2rem;
    }
}

.label {
    display: inline-flex;
    align-items: center;
    gap: 0.8rem;
    min-height: 3.2rem;
    padding: 0 1.2rem;
    border: none;
    background: transparent;
    white-space: nowrap;
    font-size: 1.2rem;
    font-weight: 500;
    line-height: 1.2;
    color: var(--bricks-base-500);
    transition: color var(--bricks-default-transition);
    cursor: pointer;

    &:focus-visible {
        outline: none;
        box-shadow: var(--bricks-shadow-focus);
    }

    &:hover {
        color: var(--bricks-base-900);
    }
}

.count {
    color: var(--bricks-base-500);
    transition: color var(--bricks-default-transition);
}

.remove {
    margin-right: 0.8rem;
}
</style>
