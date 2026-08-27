<script setup lang="ts">
/**
 * @description The gallery property editor of the sidebar.
 *
 * The image thumbnail and the empty state are native buttons rather than clickable
 * containers: both open the media library, and as `div`s they could be reached
 * neither by Tab nor by Enter — the pointer was the only way in. The card look is
 * kept by resetting the user-agent styles of the button in the style section.
 *
 * The three per-item actions are `BricksIconButton` instead of an icon inside a
 * `BricksButton`: there the caption is a required prop and becomes the accessible
 * name, so a glyph-only action cannot end up nameless. Their names carry the
 * ordinal of the image — a screen reader walking the list otherwise hears "Move
 * up" a dozen times with nothing to tell the items apart. The same ordinal names
 * the text fields of the card, for the same reason.
 *
 * At the ends of the list a move is blocked by `muted` rather than by `disabled`:
 * a reorder applies at once, and the button the person had just pressed becomes
 * the one at the end. A `disabled` button loses focus the moment it is blocked —
 * the browser drops it — so a keyboard walked out of the panel after every move
 * that reached the end. `muted` keeps the button focusable, announces the block
 * through `aria-disabled` and explains it in the hint.
 */

// #region Imports
// Types
import type { IGalleryItem } from '../../../../../common/types/content';
import type { IPropertyImageGalleryEditorProps, IPropertyImageGalleryEditorEmits } from './types';

// Vue
import { computed, useCssModule } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useEditableItemsList } from '../../composables/useEditableItemsList';

// Components
import BricksButton from '../../../../../ui/base/button/BricksButton.vue';
import BricksIconButton from '../../../../../ui/base/icon-button/BricksIconButton.vue';
import BricksInput from '../../../../../ui/inputs/BricksInput.vue';
import BricksTagsEditor from '../../../../../ui/inputs/BricksTagsEditor.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IPropertyImageGalleryEditorProps>(), {
    modelValue: () => [],
    label: '',
    fields: () => ({}),
});
// #endregion

// #region Emits
const emit = defineEmits<IPropertyImageGalleryEditorEmits>();
// #endregion

// #region Data
const $style = useCssModule();
const { t } = useI18n();
// #endregion

// #region Computed
const items = computed<IGalleryItem[]>(() => props.modelValue || []);
const hasItems = computed<boolean>(() => items.value.length > 0);
const displayLabel = computed<string>(() => props.label || t('bricks.properties.gallery.label'));

/** Whether to show the title field; on by default */
const showTitle = computed<boolean>(() => props.fields?.title !== false);
/** Whether to show the caption field; off by default */
const showCaption = computed<boolean>(() => props.fields?.caption === true);
/** Whether to show the tags editor; off by default */
const showTags = computed<boolean>(() => props.fields?.tags === true);
// #endregion

// #region Methods
const { removeItem, moveItem, updateField } = useEditableItemsList<IGalleryItem>({
    items,
    onUpdate: (value) => emit('update:modelValue', value),
});

/**
 * Opens the media gallery to add a new image.
 */
function handleAddImage(): void {
    emit('openGallery', {
        action: 'append',
        insertIndex: items.value.length,
    });
}

/**
 * Whether the item is a video, judged by its mimeType.
 */
function isVideoItem(item: IGalleryItem): boolean {
    return Boolean(item.mimeType?.startsWith('video/'));
}

/**
 * Replaces the image of an item.
 */
function handleReplaceImage(index: number): void {
    emit('openGallery', {
        action: 'replace',
        itemIndex: index,
    });
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderShellSidebarPropertyImageGalleryEditor">
        <div :class="$style.header">
            <span :class="$style.title">{{ displayLabel }}</span>
            <BricksButton size="sm" variant="primary" @click="handleAddImage">
                <BricksIcon icon="ta:outline-plus" />
                {{ t('bricks.properties.add') }}
            </BricksButton>
        </div>

        <div v-if="hasItems" :class="$style.grid">
            <div
                v-for="(item, index) in items"
                :key="item.id || `gallery_${index}`"
                :class="$style.card"
            >
                <button
                    type="button"
                    :class="$style.imageWrapper"
                    :aria-label="t('bricks.properties.gallery.replaceImage', { number: index + 1 })"
                    @click="handleReplaceImage(index)"
                >
                    <div v-if="isVideoItem(item)" :class="$style.videoPlaceholder">
                        <BricksIcon icon="ta:outline-video" />
                    </div>
                    <img
                        v-else-if="item.url"
                        :src="item.url"
                        :alt="item.title || ''"
                        :class="$style.image"
                        loading="lazy"
                        decoding="async"
                    />
                    <div v-else :class="$style.placeholder">
                        <BricksIcon icon="ta:outline-photo-plus" />
                    </div>
                    <div :class="$style.imageOverlay">
                        <BricksIcon icon="ta:outline-pencil" />
                    </div>
                </button>

                <div :class="$style.cardBody">
                    <BricksInput
                        v-if="showTitle"
                        :value="item.title || ''"
                        :placeholder="t('bricks.properties.gallery.titlePlaceholder')"
                        :aria-label="
                            t('bricks.properties.gallery.titleLabel', { number: index + 1 })
                        "
                        size="small"
                        @update:value="updateField(index, 'title', $event as string)"
                    />

                    <BricksInput
                        v-if="showCaption"
                        :value="item.caption || ''"
                        :placeholder="t('bricks.properties.gallery.captionPlaceholder')"
                        :aria-label="
                            t('bricks.properties.gallery.captionLabel', { number: index + 1 })
                        "
                        size="small"
                        @update:value="updateField(index, 'caption', $event as string)"
                    />

                    <BricksTagsEditor
                        v-if="showTags"
                        :model-value="item.tags || []"
                        :placeholder="t('bricks.properties.gallery.tagPlaceholder')"
                        :aria-label="
                            t('bricks.properties.gallery.tagsLabel', { number: index + 1 })
                        "
                        @update:model-value="updateField(index, 'tags', $event)"
                    />

                    <div :class="$style.actions">
                        <BricksIconButton
                            icon="ta:outline-arrow-up"
                            :label="t('bricks.properties.gallery.moveUp', { number: index + 1 })"
                            :hint="
                                index === 0
                                    ? t('bricks.properties.gallery.moveUpBlocked', {
                                          number: index + 1,
                                      })
                                    : ''
                            "
                            variant="ghost"
                            size="lg"
                            :muted="index === 0"
                            @click="moveItem(index, -1)"
                        />
                        <BricksIconButton
                            icon="ta:outline-arrow-down"
                            :label="t('bricks.properties.gallery.moveDown', { number: index + 1 })"
                            :hint="
                                index === items.length - 1
                                    ? t('bricks.properties.gallery.moveDownBlocked', {
                                          number: index + 1,
                                      })
                                    : ''
                            "
                            variant="ghost"
                            size="lg"
                            :muted="index === items.length - 1"
                            @click="moveItem(index, 1)"
                        />
                        <BricksIconButton
                            icon="ta:outline-trash"
                            :label="t('bricks.properties.gallery.remove', { number: index + 1 })"
                            variant="ghost"
                            size="lg"
                            @click="removeItem(index)"
                        />
                    </div>
                </div>
            </div>
        </div>

        <button v-else type="button" :class="$style.empty" @click="handleAddImage">
            <BricksIcon :class="$style.emptyIcon" icon="ta:outline-library-photo" />
            <span>{{ t('bricks.properties.gallery.empty') }}</span>
        </button>
    </div>
</template>

<style module lang="scss">
.BuilderShellSidebarPropertyImageGalleryEditor {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
}

.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
}

.title {
    font-size: 1.4rem;
    font-weight: 600;
    color: var(--bricks-base-800);
}

.grid {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
}

.card {
    display: flex;
    gap: 1.2rem;
    padding: 1rem;
    border-radius: var(--bricks-border-radius-xs);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
}

.imageWrapper {
    --bricks-base-100: #f3f4f6;

    position: relative;
    overflow: hidden;
    display: block;
    flex-shrink: 0;
    width: 8rem;
    height: 8rem;
    padding: 0;
    border-radius: var(--bricks-border-radius-xs);
    border: 0;
    background: var(--bricks-base-100);
    cursor: pointer;
    appearance: none;

    &:hover .imageOverlay,
    &:focus-visible .imageOverlay {
        opacity: 1;
    }

    &:focus-visible {
        outline: none;
        box-shadow: var(--bricks-shadow-focus);
    }
}

.image {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    font-size: 2.4rem;
    color: var(--bricks-base-400);
}

.videoPlaceholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    background: var(--bricks-base-100, #f3f4f6);
    font-size: 2.4rem;
    color: var(--bricks-base-400);
}

.imageOverlay {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgb(0 0 0 / 50%);
    font-size: 2rem;
    color: var(--bricks-base-0);
    opacity: 0;
    transition: opacity 0.2s;
    inset: 0;
}

.cardBody {
    display: flex;
    flex-direction: column;
    flex: 1;
    gap: 0.8rem;
    min-width: 0;
}

.actions {
    display: flex;
    gap: 0.4rem;
    margin-top: auto;
}

.empty {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 2.4rem;
    border-radius: var(--bricks-border-radius-xs);
    border: 0.2rem dashed var(--bricks-base-300);
    background: var(--bricks-base-50);
    font-family: inherit;
    font-size: 1.4rem;
    color: var(--bricks-base-500);
    transition:
        border-color 0.2s,
        background 0.2s;
    cursor: pointer;
    appearance: none;
    flex-direction: column;
    gap: 0.8rem;

    &:hover {
        border-color: var(--bricks-primary-400);
        background: var(--bricks-primary-50);
        color: var(--bricks-primary-600);
    }

    &:focus-visible {
        border-color: var(--bricks-primary-400);
        outline: none;
        box-shadow: var(--bricks-shadow-focus);
    }
}

.emptyIcon {
    font-size: 3.2rem;
}
</style>
