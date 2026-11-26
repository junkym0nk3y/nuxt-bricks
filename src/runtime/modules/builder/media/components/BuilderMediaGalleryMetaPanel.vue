<script setup lang="ts">
/**
 * @description The footer of the gallery: two rows instead of the single line it used
 * to be. The upper one holds the file itself (the thumbnail, the name, the alt of a
 * picture or the URL of a video and a document, the copy button, the category and the
 * deletion), the lower one the technical summary and the picking actions: in one line
 * with the fields they do not fit under any order.
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
 * needs them just as much. The alt of a video or a document is a different matter: no
 * renderer reads it, so the field is not drawn, and its place goes to a read-only URL
 * field — a disabled alt with an explanation cost the row width and still had its hint
 * cut in a narrower window. A picture gets no URL field: its address is not what is
 * looked for here, and the row keeps the room for the alt. The copy button is there for
 * every role and every kind of file; the field, where there is one, lets the address be
 * selected by hand when the clipboard refuses. The deletion stands at the end of the row
 * of fields and not in the lower right corner — that corner is left to the confirming
 * action — and it is a right of the administrator: the endpoint refuses an editor.
 *
 * Decisions held by the style section. The footer changes both its content and its
 * height (one hint row with nothing selected against two rows with a file), so the swap
 * goes through a transition: an instant one reads as the panel jumping under the cursor.
 * The wrapper around the two rows exists for that same transition — it has to have one
 * root. The look of the delete button comes from the kit's `danger`, the tone shared by
 * the destructive actions of the product, as in the list rows and in the details panel
 * of the section: the former "gray until hover" made this button the one exception to
 * the rule. The category is always the last field of the row, next to the deletion, and
 * the copy button, the category and the deletion hold the right end of the row for every
 * kind of file, so they do not change places from one file to the next. The row has to
 * stay a single line: the URL field takes whatever the other fields leave and never
 * drops below a floor of its own (with a picture the leftover goes in front of the copy
 * button instead); in a narrower window the name and the alt give way down to a floor of
 * theirs (of one width at full size; while they shrink, the loss is split in proportion
 * to the whole field, label included, so the inputs part by a few pixels), while the
 * category keeps its width: the select does not shrink with the wrapper around it and
 * ran over its neighbors. The floor of the name and the alt sits on the field (a grid
 * with a bounded track), not on the input: a floor on the input let the field shrink
 * past it, and the input ran over the label of the next field. An address in a storage
 * runs past a hundred characters, so the field shows its start, and the rest scrolls
 * inside the field. The hint row holds its height rather than shrinking to its line of
 * text: otherwise the footer would jump from 47 to the two-row height on the very first
 * file picked and shift the grid under the cursor.
 */

// #region Imports
// Types
import type { IMediaGalleryMetaPanelProps, IMediaGalleryMetaPanelEmits } from '../types/media';

// Utils
import { formatMediaTechnicalSummary, isDocumentMedia, isVideoMedia } from '../utils/mediaSummary';
import { resolveMediaDocumentExtension } from '../../../common/utils/mediaKind';

// Constants
import { MEDIA_DOCUMENT_ICONS } from '../../../common/constants/mediaDocuments';
import {
    MEDIA_ALT_MAX_LENGTH,
    MEDIA_FILENAME_MAX_LENGTH,
} from '../../../common/constants/mediaFields';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useBuilderPermissions } from '../../core/composables/useBuilderPermissions';
import { useMediaCategorySelect } from '../composables/useMediaCategorySelect';
import { useMediaMetaDrafts } from '../composables/useMediaMetaDrafts';
import { useMediaUrlCopy } from '../composables/useMediaUrlCopy';

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
/**
 * Copying the URL — a mechanism shared with the details panel of the section: the same
 * clipboard call and the same messages. The toast is drawn by the modal.
 */
const { copyUrl: handleCopyUrl } = useMediaUrlCopy({
    item: () => props.selectedItem,
    onNotify: (message, variant) => emit('notify', message, variant),
});
// #endregion

// #region Computed
/** A video has no picture for the thumb and no alt: the renderer gives out a `<video>` */
const isVideo = computed<boolean>(() =>
    props.selectedItem ? isVideoMedia(props.selectedItem) : false
);

/** A document has no picture for the thumb and no alt either: a link to it is a link */
const isDocument = computed<boolean>(() =>
    props.selectedItem ? isDocumentMedia(props.selectedItem) : false
);

/**
 * A picture gets the thumb and the alt field; a video and a document get an icon and the
 * URL field in the place of the alt. The right to edit is a separate matter: for a role
 * without it the alt of a picture stays, disabled.
 */
const isPicture = computed<boolean>(() => !isVideo.value && !isDocument.value);

/** The icon of the thumb of a file with no picture */
const thumbIcon = computed<string>(() => {
    const extension = props.selectedItem
        ? resolveMediaDocumentExtension(props.selectedItem.mimeType)
        : null;

    return extension ? MEDIA_DOCUMENT_ICONS[extension] : 'ta:outline-video';
});
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
                            v-if="isPicture"
                            :src="props.selectedItem.previewUrl ?? props.selectedItem.url"
                            :alt="props.selectedItem.alt || props.selectedItem.filename"
                            fit="cover"
                        />
                        <BricksIcon v-else :icon="thumbIcon" />
                    </div>

                    <div :class="[$style.field, $style._bounded]">
                        <span :class="$style.fieldLabel">{{ t('bricks.media.nameLabel') }}</span>
                        <div :class="$style.control">
                            <BricksInput
                                :value="editableFilename"
                                :max-length="MEDIA_FILENAME_MAX_LENGTH"
                                :disabled="!canEdit"
                                :placeholder="t('bricks.media.filenamePlaceholder')"
                                @update:value="editableFilename = $event"
                            />
                        </div>
                    </div>

                    <div v-if="isPicture" :class="[$style.field, $style._bounded]">
                        <span :class="$style.fieldLabel">Alt</span>
                        <div :class="$style.control">
                            <BricksInput
                                :value="editableAlt"
                                :max-length="MEDIA_ALT_MAX_LENGTH"
                                :disabled="!canEdit"
                                :placeholder="t('bricks.media.altPlaceholder')"
                                @update:value="editableAlt = $event"
                            />
                        </div>
                    </div>

                    <div v-else :class="[$style.field, $style._url]">
                        <span :class="$style.fieldLabel">{{ t('bricks.media.details.url') }}</span>
                        <div :class="[$style.control, $style._url]">
                            <BricksInput
                                :value="props.selectedItem.url"
                                :aria-label="t('bricks.media.details.url')"
                                readonly
                            />
                        </div>
                    </div>

                    <div :class="$style.copySlot">
                        <BricksIconButton
                            icon="ta:outline-copy"
                            :label="t('bricks.media.details.copyUrl')"
                            size="lg"
                            tooltip-side="top"
                            @click="handleCopyUrl"
                        />
                    </div>

                    <div :class="[$style.field, $style._category]">
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

    &._bounded {
        display: grid;
        grid-template-columns: auto minmax(9rem, 26rem);
        min-width: auto;
    }

    &._url {
        flex: 1 0 18rem;
    }

    &._category {
        flex-shrink: 0;
    }
}

.copySlot {
    display: flex;
    flex-shrink: 0;
    margin-left: auto;
}

.fieldLabel {
    white-space: nowrap;
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--bricks-base-500);
}

.control {
    &._category {
        width: 17rem;
    }

    &._url {
        flex: 1;
        min-width: 0;
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
