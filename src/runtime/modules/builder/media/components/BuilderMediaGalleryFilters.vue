<script setup lang="ts">
/**
 * @description The track of categories: the tabs on the left, the actions over the
 * categories on the right.
 *
 * There is no search here — it moved into the header of the modal. A bordered field
 * standing on the same line as the underline of the active tab read as an underline of
 * the field itself; besides, the search concerns the whole of the media library rather
 * than the track of categories.
 *
 * Creating a category lives right here: the "+" button turns into an input field in the
 * place of a tab. The button is a separate one rather than an element of the track: any
 * item of a `ToggleGroup` gets selected and would change the filter (see
 * `BuilderMediaGalleryCategoryTabs`). The two share one place in the row, so they
 * replace one another through `out-in`: on screen at once they would look like two
 * different ways to create a category. The whole block is an edit of the library —
 * without the right to edit, the categories are only filtered.
 *
 * Next to it stands the toggle of the managing mode, the one that brings the crosses
 * out on the categories of the user. The mode is local and is not reported upward: a
 * deletion arrives as a finished event, and the state of the row is of no use to anyone
 * outside the row. It goes out on its own once there is nothing left to manage —
 * otherwise, having deleted the last category of one's own, one would stay in a mode
 * with not a single cross in sight.
 *
 * The `span` around the branch with the buttons is a must: `BricksTooltip` renders a
 * fragment (the activator plus the portal of the hint), while `Transition` can work
 * with one root element of a branch only. Without that span the `out-in` mode jams —
 * the leaving branch never reports its end, and the entering one is not mounted at all.
 * The same device is used in `BricksTabBar`.
 *
 * The tail of the row carries the actions of the caller: the dashboard section puts the
 * upload parameters cog there — it belongs not to the track but to what will travel
 * into the selected category. It stands outside the `Transition`, otherwise an opened
 * category field would carry it away along with itself.
 *
 * Decisions held by the style section: everything is aligned to the bottom edge,
 * because the underline of the selected tab has to lie exactly on the line of the
 * track, and that line runs the full width — broken off after the last tab it would
 * read as unfinished. The actions over the categories are pressed to the right edge of
 * the row rather than following the last tab: right up against the track they read as
 * two more tabs, and their place in the row would depend on how many categories had
 * been created. The width of the create field is set to fit a category caption, while
 * its look, its focus, its error and its clear cross are drawn by `BricksInput` — the
 * duplicate error arrives through that component's own `errorMessage` prop, so there is
 * no message of our own under the row any more.
 */

// #region Imports
// Types
import type { IMediaGalleryFiltersProps, IMediaGalleryFiltersEmits } from '../types/media';

// Utils
import { mediaCategoryLabelToSlug } from '../../../common/constants/mediaCategories';

// Vue
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useBuilderPermissions } from '../../core/composables/useBuilderPermissions';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksIconButton from '../../../ui/base/icon-button/BricksIconButton.vue';
import BricksInput from '../../../ui/inputs/BricksInput.vue';
import BuilderMediaGalleryCategoryTabs from './BuilderMediaGalleryCategoryTabs.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IMediaGalleryFiltersProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IMediaGalleryFiltersEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const { canEdit, canDelete } = useBuilderPermissions();
const isCreateOpen = ref(false);
const isManaging = ref(false);
const newCategoryLabel = ref('');
const createInputRef = ref<InstanceType<typeof BricksInput> | null>(null);
// #endregion

// #region Computed
/**
 * Whether there is anything to delete: no undeletable categories are left, so the
 * managing mode shows exactly when at least one category has been created.
 */
const hasDeletableCategories = computed<boolean>(() => props.categories.length > 0);
/**
 * A duplicate is looked for by two signs at once, and neither of them is spare.
 *
 * By the slug — because that is exactly what the server counts uniqueness by: two
 * captions differing only by a diacritic, or only by a trailing "!", give one and the
 * same slug, and such a POST used to return the existing category as a success — the
 * field closed, no new category appeared, and there was no error. The expanding
 * transliteration belongs here too: a single Cyrillic letter can take three characters
 * of a slug, so 17 and 20 such letters run into the ceiling of the slug and are cut
 * down to one and the same value, although the captions themselves are shorter than
 * their own ceiling of 50 characters and the server takes them.
 *
 * By the caption — because a match of the slugs does not cover the opposite case: a
 * caption and a slug are tied only at the moment of creation, and on a category created
 * some other way once they have drifted apart (in the live database one caption lies
 * under the hand-written slug `icons`, while a transliteration of that same caption
 * computes to `ikonki`). The server will take such a pair, and the track will end up
 * with two tabs there is no telling apart.
 *
 * The message names the caption of the category that was FOUND rather than the one that
 * was typed: otherwise, having typed a caption that differs by one letter, one would
 * read that very caption back as "already exists", fail to find it in the track and take
 * it for an error of the field.
 */
const duplicateError = computed<string | null>(() => {
    const label = newCategoryLabel.value.trim().toLowerCase();
    const slug = mediaCategoryLabelToSlug(newCategoryLabel.value);

    if (!label) {
        return null;
    }

    const duplicate = props.categories.find(
        (category) =>
            category.label.toLowerCase() === label || (Boolean(slug) && category.slug === slug)
    );

    return duplicate ? t('bricks.media.categoryDuplicate', { name: duplicate.label }) : null;
});

const canSubmitCategory = computed<boolean>(
    () => Boolean(newCategoryLabel.value.trim()) && !duplicateError.value
);

/** Caption of the managing mode toggle — it doubles as the text of its hint */
const manageLabel = computed<string>(() =>
    isManaging.value ? t('bricks.media.categoryManageDone') : t('bricks.media.categoryManage')
);
// #endregion

// #region Methods
/** Handles the choice of a category tab */
function handleFilterChange(value: string): void {
    emit('update:categoryFilter', value);
}

/**
 * Opens the input field of a new category in the place of the "+" button.
 *
 * The focus is set after a `nextTick` and is looked up in the DOM of the component: the
 * contract of `BricksInput` holds no `focus()` method of its own, and the native
 * `<input>` lies inside it.
 */
async function handleOpenCreate(): Promise<void> {
    isCreateOpen.value = true;
    newCategoryLabel.value = '';

    await nextTick();
    createInputRef.value?.$el?.querySelector('input')?.focus();
}

/** Toggles the managing mode of the categories */
function handleToggleManaging(): void {
    isManaging.value = !isManaging.value;
}

/** Closes the input field, dropping what was typed */
function handleCancelCreate(): void {
    isCreateOpen.value = false;
    newCategoryLabel.value = '';
}

/**
 * Hands the creation upward. The field closes at once without waiting for the answer:
 * a refusal arrives as a toast, and holding the field open for the duration of the
 * request would mean hanging the row of filters — on a success the tab shows up by
 * itself anyway.
 */
function handleSubmitCategory(): void {
    if (!canSubmitCategory.value || props.isCreatingCategory) {
        return;
    }

    emit('create-category', newCategoryLabel.value.trim());
    handleCancelCreate();
}

/** Emits the deletion of a category */
function handleDeleteCategory(slug: string): void {
    emit('delete-category', slug);
}
// #endregion

// #region Lifecycle
// The mode goes out once there is nothing to manage: having deleted the last category
// of their own, the user would be left in a mode that shows no sign of itself, while
// the button for leaving it disappears along with it
watch(hasDeletableCategories, (hasDeletable) => {
    if (!hasDeletable) {
        isManaging.value = false;
    }
});
// #endregion
</script>

<template>
    <div :class="$style.BuilderMediaGalleryFilters">
        <BuilderMediaGalleryCategoryTabs
            :model-value="props.categoryFilter"
            :categories="props.categories"
            :category-counts="props.categoryCounts"
            :total-count="props.totalCount"
            :is-managing="isManaging"
            @update:model-value="handleFilterChange"
            @delete-category="handleDeleteCategory"
        />

        <div v-if="canEdit" :class="$style.rowTail">
            <Transition mode="out-in" name="bricks-fade-fast">
                <div v-if="isCreateOpen" :class="$style.createRow">
                    <BricksInput
                        ref="createInputRef"
                        :class="$style.createInput"
                        :value="newCategoryLabel"
                        type="text"
                        :placeholder="t('bricks.media.categoryNamePlaceholder')"
                        :disabled="props.isCreatingCategory"
                        :error-message="duplicateError"
                        @update:value="newCategoryLabel = $event"
                        @keydown.enter.prevent="handleSubmitCategory"
                        @keydown.esc.prevent="handleCancelCreate"
                    />

                    <BricksButton
                        size="sm"
                        variant="primary"
                        equal
                        :disabled="!canSubmitCategory || props.isCreatingCategory"
                        :aria-label="t('bricks.media.categoryCreateConfirm')"
                        @click="handleSubmitCategory"
                    >
                        <BricksIcon icon="ta:outline-plus" />
                    </BricksButton>

                    <BricksButton
                        size="sm"
                        variant="secondary"
                        equal
                        :aria-label="t('bricks.common.cancel')"
                        @click="handleCancelCreate"
                    >
                        <BricksIcon icon="ta:outline-x" />
                    </BricksButton>
                </div>

                <span v-else :class="$style.rowActions">
                    <BricksIconButton
                        icon="ta:outline-plus"
                        :label="t('bricks.media.categoryCreate')"
                        variant="ghost"
                        size="lg"
                        tooltip-side="top"
                        @click="handleOpenCreate"
                    />

                    <BricksIconButton
                        v-if="hasDeletableCategories && canDelete"
                        :icon="isManaging ? 'ta:outline-check' : 'ta:outline-pencil'"
                        :label="manageLabel"
                        :active="isManaging"
                        variant="ghost"
                        size="lg"
                        tooltip-side="top"
                        @click="handleToggleManaging"
                    />
                </span>
            </Transition>

            <slot name="actions" />
        </div>
    </div>
</template>
<style module lang="scss">
.BuilderMediaGalleryFilters {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1.6rem;
    border-bottom: 1px solid var(--bricks-base-200);
}

.createRow {
    display: inline-flex;
    align-items: center;
    padding-bottom: 0.2rem;
    gap: 0.4rem;
}

.rowActions {
    display: inline-flex;
    align-items: center;
    padding-bottom: 0.2rem;
    gap: 0.2rem;
}

.rowTail {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
}

.createInput {
    width: 18rem;
}
</style>
