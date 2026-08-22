<script setup lang="ts">
/**
 * @description The details panel of a file in the "Media" section: the preview, the
 * fields to edit, the facts about the file and the actions over it.
 *
 * The container is the same as the details panel of a page has — the section has to
 * read as a part of the dashboard rather than as a modal built into the page. That is
 * why the horizontal meta panel of the modal did not move over here: no other part of
 * the dashboard has such a band.
 *
 * The mechanisms behind it are the old ones: the same controls of the kit, the same
 * commit of an edit when focus leaves (`useMediaMetaDrafts`), and the same technical
 * summary as the tile and the meta panel show. A file has no primary action: "Cancel"
 * and "Pick" belong to the picker, and the picker stayed a modal.
 *
 * The preview is a picture, and a glyph for a video: there is nothing to take a frame
 * out of a video with, and an empty frame would read as a file that failed to load.
 * The fields of a file are disabled rather than hidden for a role with no right to
 * edit: the name, the alt and the category are facts about the file, and an observer
 * needs them just as much. The commit happens when focus leaves the group of fields:
 * the contract of `BricksInput` holds no blur event, while `focusout` bubbles. The URL
 * field is `readonly` and not `disabled`: the address of a file is what people come
 * here to take away, and a disabled field does not show it (a dimming tone, a selection
 * out of reach). Deleting a file is a right of the administrator — an editor is refused
 * by the endpoint and has no button at all; the full-screen view stays with everyone.
 *
 * Decisions held by the style section: the preview holds the height of the mock-up,
 * because the proportion of a file is not known in advance and a panel without a frame
 * of a fixed size would jump on every pick.
 */

// #region Imports
// Types
import type { TBrickDemoValues } from '../../../common/types/index';
import type { IBrickUiCommonProp } from '../../../ui/types/common';
import type {
    IMediaSectionDetailsPanelProps,
    IMediaSectionDetailsPanelEmits,
} from '../types/media';

// Utils
import { formatFileSize } from '../utils/formatFileSize';
import { formatMediaDimensions, formatMediaFormatName, isVideoMedia } from '../utils/mediaSummary';
import { formatPageDateTime } from '../../../common/utils/bricks/dates';
import { resolveMediaCategoryLabelBySlug } from '../utils/categoryLabels';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useBuilderPermissions } from '../../core/composables/useBuilderPermissions';
import { useMediaMetaDrafts } from '../composables/useMediaMetaDrafts';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksCloseButton from '../../../ui/base/modal/BricksCloseButton.vue';
import BricksIconButton from '../../../ui/base/icon-button/BricksIconButton.vue';
import BricksImage from '../../../ui/base/image/BricksImage.vue';
import BricksInput from '../../../ui/inputs/BricksInput.vue';
import BricksSelect from '../../../ui/inputs/BricksSelect.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IMediaSectionDetailsPanelProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IMediaSectionDetailsPanelEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const { canEdit, canDelete } = useBuilderPermissions();
/**
 * The drafts of the fields — the same composable the meta panel of the modal uses: an
 * edit is sent when focus leaves, and unsaved typing outlives the updates of the
 * server.
 */
const {
    filename: editableFilename,
    alt: editableAlt,
    commit: handleMetaCommit,
} = useMediaMetaDrafts({
    item: () => props.item,
    onCommit: (meta) => emit('update-meta', meta),
});
// #endregion

// #region Computed
/**
 * "No category" comes first: a category is optional, and taking one off a file can be
 * done from here only. The empty string is the contract of `BricksSelect` for an empty
 * value.
 */
const categoryOptions = computed<IBrickUiCommonProp[]>(() => [
    { label: t('bricks.media.noCategory'), value: '' },
    ...props.categories.map((category) => ({
        label: category.label,
        value: category.slug,
    })),
]);
const categoryFacets = computed<TBrickDemoValues[]>(() =>
    categoryOptions.value.map((option) => option.value)
);
const selectedCategory = computed<string>(() => props.item.category ?? '');
const isVideo = computed<boolean>(() => isVideoMedia(props.item));
/** A video does not use the alt: the renderer gives out a `<video>`, not an `<img>` */
const isAltDisabled = computed<boolean>(() => isVideo.value || !canEdit.value);

/**
 * The subtitle of the panel: where the file is from and when it got into the media
 * library. The category by its caption rather than by its slug: the data holds `promo`,
 * while the person created it under a caption of their own.
 */
const originLine = computed<string>(() => {
    const category = props.item.category
        ? resolveMediaCategoryLabelBySlug(props.item.category, props.categories)
        : t('bricks.media.noCategory');

    return `${category} · ${t('bricks.media.details.uploadedOn', {
        date: formatPageDateTime(props.item.uploadedAt),
    })}`;
});

/**
 * The facts about a file, as key-value pairs. The dimensions come from the same helper
 * the tile and the meta panel use: on an svg and on a video it gives out the caption of
 * the type, and a reading of one's own in a third place would part from the other two.
 */
const fileFacts = computed<{ key: string; label: string; value: string }[]>(() => [
    {
        key: 'size',
        label: t('bricks.media.details.size'),
        value: formatFileSize(props.item.size),
    },
    {
        key: 'dimensions',
        label: t('bricks.media.details.dimensions'),
        value: formatMediaDimensions(props.item, t),
    },
    {
        key: 'format',
        label: t('bricks.media.details.format'),
        value: formatMediaFormatName(props.item.mimeType),
    },
    {
        key: 'uploadedAt',
        label: t('bricks.media.details.uploadedAt'),
        value: formatPageDateTime(props.item.uploadedAt),
    },
]);
// #endregion

// #region Methods
/**
 * Emits a change of the category of the file.
 *
 * There is no need to put the value back: `BricksSelect` is controlled and shows what
 * arrived in its prop — on a refusal of the server the source does not change.
 *
 * @param value - The value of the selector.
 */
function handleCategoryChange(value: TBrickDemoValues | null): void {
    if (typeof value !== 'string' || value === selectedCategory.value) {
        return;
    }

    // An empty string out of the selector means "no category", not an empty slug
    emit('update-category', value || null);
}

/**
 * Copies the address of the file into the clipboard.
 */
async function handleCopyUrl(): Promise<void> {
    try {
        await navigator.clipboard.writeText(props.item.url);
        emit('notify', t('bricks.media.details.urlCopied'), 'success');
    } catch {
        emit('notify', t('bricks.media.details.copyFailed'), 'error');
    }
}

/**
 * Asks the host to open the file full screen.
 */
function handlePreview(): void {
    emit('preview');
}

/**
 * Asks the host to confirm the deletion of the file.
 */
function handleRemove(): void {
    emit('remove');
}

/**
 * Closes the panel.
 */
function handleClose(): void {
    emit('close');
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderMediaSectionDetailsPanel">
        <div :class="$style.header">
            <div :class="$style.titleRow">
                <h2 :class="$style.title">{{ props.item.filename }}</h2>
                <BricksCloseButton @click="handleClose" />
            </div>
            <p :class="$style.subtitle">{{ originLine }}</p>
        </div>

        <div :class="[$style.content, 'bricks-scrollbox']">
            <div :class="$style.preview">
                <BricksImage
                    v-if="!isVideo"
                    :src="props.item.previewUrl ?? props.item.url"
                    :alt="props.item.alt || props.item.filename"
                    fit="contain"
                />
                <BricksIcon v-else icon="ta:outline-video" :class="$style.previewIcon" />
            </div>

            <div :class="$style.fields" @focusout="handleMetaCommit">
                <div :class="$style.field">
                    <span :class="$style.fieldLabel">{{ t('bricks.media.nameLabel') }}</span>
                    <BricksInput
                        :value="editableFilename"
                        :disabled="!canEdit"
                        :placeholder="t('bricks.media.filenamePlaceholder')"
                        @update:value="editableFilename = $event"
                    />
                </div>

                <div :class="$style.field">
                    <span :class="$style.fieldLabel">Alt</span>
                    <BricksInput
                        :value="editableAlt"
                        :disabled="isAltDisabled"
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
                <span :class="$style.fieldLabel">{{ t('bricks.media.categoryLabel') }}</span>
                <BricksSelect
                    :value="selectedCategory"
                    :specs="categoryOptions"
                    :facets="categoryFacets"
                    :disabled="!canEdit"
                    :aria-label="t('bricks.media.categoryLabel')"
                    @update:value="handleCategoryChange"
                />
            </div>

            <div :class="$style.facts">
                <span :class="$style.groupLabel">{{ t('bricks.media.details.about') }}</span>
                <div v-for="fact in fileFacts" :key="fact.key" :class="$style.factRow">
                    <span :class="$style.factKey">{{ fact.label }}</span>
                    <span :class="$style.factValue">{{ fact.value }}</span>
                </div>
            </div>

            <div :class="$style.field">
                <span :class="$style.fieldLabel">{{ t('bricks.media.details.url') }}</span>
                <div :class="$style.urlRow">
                    <BricksInput
                        :value="props.item.url"
                        :aria-label="t('bricks.media.details.url')"
                        readonly
                    />
                    <BricksIconButton
                        icon="ta:outline-copy"
                        :label="t('bricks.media.details.copyUrl')"
                        variant="ghost"
                        @click="handleCopyUrl"
                    />
                </div>
            </div>
        </div>

        <div :class="$style.footer">
            <BricksButton
                :class="$style.previewButton"
                size="md"
                variant="secondary"
                @click="handlePreview"
            >
                {{ t('bricks.media.fullscreen') }}
            </BricksButton>

            <BricksIconButton
                v-if="canDelete"
                icon="ta:outline-trash"
                :label="t('bricks.common.delete')"
                danger
                @click="handleRemove"
            />
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderMediaSectionDetailsPanel {
    display: flex;
    flex-direction: column;
    height: 100%;
}

.header {
    display: flex;
    flex-shrink: 0;
    flex-direction: column;
    gap: 0.2rem;
    padding: 1.8rem 2rem 1.6rem;
    border-bottom: 1px solid var(--bricks-base-200);
}

.titleRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
}

.title {
    overflow: hidden;
    margin: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.6rem;
    font-weight: 600;
    color: var(--bricks-base-900);
}

.subtitle {
    overflow: hidden;
    margin: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.2rem;
    color: var(--bricks-base-400);
}

.content {
    overflow-y: auto;
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 1.6rem;
    padding: 1.6rem 2rem;
}

.preview {
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    height: 16.8rem;
    border-radius: var(--bricks-border-radius-sm);
    background: var(--bricks-base-100);
}

.previewIcon {
    width: 3.2rem;
    height: 3.2rem;
    color: var(--bricks-base-500);
}

.fields {
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
}

.field {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    min-width: 0;
}

.fieldLabel {
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--bricks-base-500);
}

.facts {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
}

.groupLabel {
    text-transform: uppercase;
    font-size: 1.2rem;
    font-weight: 600;
    letter-spacing: 0.05rem;
    color: var(--bricks-base-400);
}

.factRow {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1.2rem;
}

.factKey {
    flex-shrink: 0;
    font-size: 1.2rem;
    color: var(--bricks-base-500);
}

.factValue {
    overflow: hidden;
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.2rem;
    color: var(--bricks-base-900);
}

.urlRow {
    display: flex;
    align-items: center;
    gap: 0.8rem;
}

.footer {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    gap: 0.8rem;
    padding: 1.6rem 2rem;
    border-top: 1px solid var(--bricks-base-200);
}

.previewButton {
    flex: 1;
}
</style>
