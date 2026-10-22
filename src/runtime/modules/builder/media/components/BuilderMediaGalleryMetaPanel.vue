<script setup lang="ts">
/**
 * @description The footer of the gallery: two rows instead of the single line it used
 * to be. The upper one holds the edits (the thumbnail, the name, the alt, the
 * category), the lower one the technical summary and the actions. They are split
 * because the set of actions depends on the type of the file (a video and a vector have
 * no variants), and in one line with the fields it does not fit under any order.
 *
 * With no file selected the footer folds into a single row with a hint: in that state
 * the component used to draw nothing at all, and an empty band hung there with no
 * explanation. The summary of the media library lives in the header — in the same place
 * as the upload button, that is, next to what changes it.
 *
 * The "Cancel" / "Pick" buttons live only in the picking context: in the manager there
 * is nothing to pick, a file is edited where it lies.
 *
 * The fields of a file are disabled rather than hidden for a role with no right to
 * edit: the name, the alt and the category are facts about the file, and an observer
 * needs them just as much. The deletion stands with the fields of the file and not in
 * the right corner — that corner is left to the confirming action — and it is a right of
 * the administrator: the endpoint refuses an editor.
 *
 * Decisions held by the style section. The footer changes both its content and its
 * height (one hint row with nothing selected against two rows with a file), so the swap
 * goes through a transition: an instant one reads as the panel jumping under the cursor.
 * The wrapper around the two rows exists for that same transition — it has to have one
 * root. The
 * delete button is pressed to the right edge of the row of edits, and its look comes
 * from the kit's `danger`, the tone shared by the destructive actions of the product,
 * as in the list rows and in the details panel of the section: the former "gray until
 * hover" made this button the one exception to the rule. The widths of the fields come
 * from the mock-up and do not stretch, because the row has to stay a single line:
 * stretched, "Category" would travel off the edge in a narrow window. The hint row
 * holds its height rather than shrinking to its line of text: otherwise the footer would
 * jump from 47 to the two-row height on the very first file picked and shift the grid
 * under the cursor.
 */

// #region Imports
// Types
import type { IMediaGalleryMetaPanelProps, IMediaGalleryMetaPanelEmits } from '../types/media';

// Utils
import { formatMediaTechnicalSummary, isVideoMedia } from '../utils/mediaSummary';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useBuilderPermissions } from '../../core/composables/useBuilderPermissions';
import { useMediaCategorySelect } from '../composables/useMediaCategorySelect';
import { useMediaMetaDrafts } from '../composables/useMediaMetaDrafts';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksIconButton from '../../../ui/base/icon-button/BricksIconButton.vue';
import BricksImage from '../../../ui/base/image/BricksImage.vue';
import BricksInput from '../../../ui/inputs/BricksInput.vue';
import BricksSelect from '../../../ui/inputs/BricksSelect.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IMediaGalleryMetaPanelProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IMediaGalleryMetaPanelEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const { canEdit, canDelete } = useBuilderPermissions();
/**
 * The drafts of the fields of a file — a mechanism shared with the details panel of the
 * section: the typing, the normalization and the protection of a draft from the updates
 * of the server all live in the composable.
 */
const {
    filename: editableFilename,
    alt: editableAlt,
    commit: handleMetaCommit,
} = useMediaMetaDrafts({
    item: () => props.selectedItem,
    onCommit: (meta) => emit('update-meta', meta),
});
/**
 * The selector of the category — a mechanism shared with the details panel of the
 * section: the list of options, the value shown and the rule that an empty string
 * means "no category" all live in the composable.
 */
const { categoryOptions, categoryFacets, selectedCategory, handleCategoryChange } =
    useMediaCategorySelect({
        item: () => props.selectedItem,
        categories: () => props.categories,
        onChange: (category) => emit('update-category', category),
    });
// #endregion

// #region Computed
/**
 * A video does not use the alt: the renderer gives out a `<video>`, not an `<img>`. The
 * right to edit is a separate reason to block the field, and the two are not merged:
 * the placeholder tells the alt of a video from the alt of a picture, and under a role
 * with no right it would otherwise call a picture a video.
 */
const isVideo = computed<boolean>(() =>
    props.selectedItem ? isVideoMedia(props.selectedItem) : false
);
const technicalSummary = computed<string>(() =>
    props.selectedItem ? formatMediaTechnicalSummary(props.selectedItem, t) : ''
);
// #endregion

// #region Methods
/** Emits the request to delete the selected item */
function handleRemove(): void {
    emit('remove');
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderMediaGalleryMetaPanel">
        <Transition mode="out-in" name="bricks-fade-fast">
            <div v-if="props.selectedItem" :class="$style.selectedState">
                <div :class="$style.fieldsRow" @focusout="handleMetaCommit">
                    <div :class="$style.selectedThumb">
                        <BricksImage
                            v-if="!isVideoMedia(props.selectedItem)"
                            :src="props.selectedItem.previewUrl ?? props.selectedItem.url"
                            :alt="props.selectedItem.alt || props.selectedItem.filename"
                            fit="cover"
                        />
                        <BricksIcon v-else icon="ta:outline-video" />
                    </div>

                    <div :class="$style.field">
                        <span :class="$style.fieldLabel">{{ t('bricks.media.nameLabel') }}</span>
                        <div :class="[$style.control, $style._name]">
                            <BricksInput
                                :value="editableFilename"
                                :disabled="!canEdit"
                                :placeholder="t('bricks.media.filenamePlaceholder')"
                                @update:value="editableFilename = $event"
                            />
                        </div>
                    </div>

                    <div :class="$style.field">
                        <span :class="$style.fieldLabel">Alt</span>
                        <div :class="[$style.control, $style._alt]">
                            <BricksInput
                                :value="editableAlt"
                                :disabled="isVideo || !canEdit"
                                :placeholder="
                                    isVideo
                                        ? t('bricks.media.altUnusedForVideo')
                                        : t('bricks.media.altPlaceholder')
                                "
                                @update:value="editableAlt = $event"
                            />
                        </div>
                    </div>

                    <div :class="$style.field">
                        <span :class="$style.fieldLabel">{{
                            t('bricks.media.categoryLabel')
                        }}</span>
                        <div :class="[$style.control, $style._category]">
                            <BricksSelect
                                :value="selectedCategory"
                                :specs="categoryOptions"
                                :facets="categoryFacets"
                                :disabled="!canEdit"
                                :aria-label="t('bricks.media.categoryLabel')"
                                @update:value="handleCategoryChange"
                            />
                        </div>
                    </div>

                    <BricksIconButton
                        v-if="canDelete"
                        :class="$style.removeButton"
                        icon="ta:outline-trash"
                        :label="t('bricks.common.delete')"
                        danger
                        size="lg"
                        tooltip-side="top"
                        @click="handleRemove"
                    />
                </div>

                <div :class="$style.divider" />

                <div :class="$style.technicalRow">
                    <p :class="$style.summary">{{ technicalSummary }}</p>

                    <div v-if="props.showPickerActions" :class="$style.actions">
                        <BricksButton size="md" variant="secondary" @click="emit('close')">
                            {{ t('bricks.media.cancel') }}
                        </BricksButton>
                        <BricksButton size="md" variant="primary" @click="emit('insert')">
                            {{ t('bricks.media.select') }}
                        </BricksButton>
                    </div>
                </div>
            </div>

            <div v-else :class="$style.emptyRow">
                <p :class="$style.summary">{{ t('bricks.media.selectFileHint') }}</p>

                <div v-if="props.showPickerActions" :class="$style.actions">
                    <BricksButton size="md" variant="secondary" @click="emit('close')">
                        {{ t('bricks.media.cancel') }}
                    </BricksButton>
                    <BricksButton size="md" variant="primary" disabled @click="emit('insert')">
                        {{ t('bricks.media.select') }}
                    </BricksButton>
                </div>
            </div>
        </Transition>
    </div>
</template>

<style module lang="scss">
.BuilderMediaGalleryMetaPanel {
    display: flex;
    flex-direction: column;
    justify-content: center;
    width: 100%;
}

.selectedState {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
}

.fieldsRow {
    display: flex;
    align-items: center;
    gap: 1.2rem;
}

.selectedThumb {
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 3.6rem;
    height: 3.6rem;
    border-radius: var(--bricks-border-radius-xs);
    background: var(--bricks-base-100);
    font-size: 1.6rem;
    color: var(--bricks-base-500);
}

.field {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 0;
}

.fieldLabel {
    white-space: nowrap;
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--bricks-base-500);
}

.removeButton {
    margin-left: auto;
}

.control {
    &._name {
        width: 26rem;
    }

    &._alt {
        width: 30rem;
    }

    &._category {
        width: 17rem;
    }
}

.divider {
    height: 1px;
    background: var(--bricks-base-200);
}

.technicalRow,
.emptyRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.2rem;
}

.emptyRow {
    min-height: 4.4rem;
}

.summary {
    overflow: hidden;
    margin: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.2rem;
    color: var(--bricks-base-500);
}

.actions {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    flex-shrink: 0;
}
</style>
