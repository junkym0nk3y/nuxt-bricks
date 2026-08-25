<script setup lang="ts">
/**
 * @description Media picker of a property: a preview of the picked image or video, the
 * buttons that open the gallery and clear the choice, and the address of the file.
 *
 * The preview area pins the light theme with hex values of its own.
 */

// #region Imports
// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BricksButton from '../../../../../ui/base/button/BricksButton.vue';
// #endregion

// #region Props
interface IPropertyMediaPickerProps {
    modelValue?: string;
    label?: string;
    type?: 'image' | 'video';
}

// The caption defaults to empty rather than to a word: `withDefaults` is compiled
// into the props options, where the translator does not exist yet — so the fallback
// is resolved by a computed below
const props = withDefaults(defineProps<IPropertyMediaPickerProps>(), {
    modelValue: '',
    label: '',
    type: 'image',
});
// #endregion

// #region Emits
interface IPropertyMediaPickerEmits {
    'update:modelValue': [value: string];
    openGallery: [];
}

const emit = defineEmits<IPropertyMediaPickerEmits>();
// #endregion

// #region Data
const { t } = useI18n();
// #endregion

// #region Computed
/** Caption of the field: the one passed in, or the generic name of the editor */
const resolvedLabel = computed(() => props.label || t('bricks.properties.mediaPicker.label'));

const hasMedia = computed(() => Boolean(props.modelValue));
const mediaType = computed(() => props.type);
const previewIcon = computed(() =>
    props.type === 'video' ? 'ta:outline-video' : 'ta:outline-photo'
);
// #endregion

// #region Methods
/**
 * Opens media gallery modal
 */
function handleOpenGallery(): void {
    emit('openGallery');
}

/**
 * Removes selected media
 */
function handleRemove(): void {
    emit('update:modelValue', '');
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderShellSidebarPropertyMediaPicker">
        <label :class="$style.label">{{ resolvedLabel }}</label>

        <div :class="$style.preview">
            <img
                v-if="hasMedia && mediaType === 'image'"
                :src="modelValue"
                :class="$style.previewImage"
                :alt="t('bricks.properties.mediaPicker.previewAlt')"
                loading="lazy"
                decoding="async"
            />

            <video
                v-else-if="hasMedia && mediaType === 'video'"
                :src="modelValue"
                :class="$style.previewImage"
                muted
                playsinline
            />

            <div v-else :class="$style.previewEmpty">
                <BricksIcon :class="$style.previewIcon" :icon="previewIcon" />
            </div>
        </div>

        <div :class="$style.actions">
            <BricksButton
                size="sm"
                variant="primary"
                :class="$style.button"
                @click="handleOpenGallery"
            >
                <BricksIcon icon="ta:outline-folder-open" />
                {{ t('bricks.properties.select') }}
            </BricksButton>

            <BricksButton
                v-if="hasMedia"
                size="sm"
                variant="danger"
                :class="$style.button"
                @click="handleRemove"
            >
                <BricksIcon icon="ta:outline-trash" />
                {{ t('bricks.common.delete') }}
            </BricksButton>
        </div>

        <div v-if="hasMedia" :class="$style.urlDisplay">
            <span :class="$style.url">{{ modelValue }}</span>
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderShellSidebarPropertyMediaPicker {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
}

.label {
    font-size: 1.4rem;
    font-weight: 500;
    color: var(--bricks-base-900);
}

.preview {
    --bricks-base-50: #f9fafb;
    --bricks-base-300: #d1d5db;

    overflow: hidden;
    width: 100%;
    height: 16rem;
    border-radius: var(--bricks-border-radius-xs);
    border: 1px solid var(--bricks-base-300);
    background: var(--bricks-base-50);
}

.previewImage {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
}

.previewEmpty {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
}

.previewIcon {
    font-size: 4.8rem;
    color: var(--bricks-base-300);
}

.actions {
    display: flex;
    gap: 0.8rem;
}

.button {
    flex: 1;
}

.urlDisplay {
    overflow: hidden;
    padding: 0.8rem;
    border-radius: 0.4rem;
    background: var(--bricks-base-100);
}

.url {
    overflow: hidden;
    display: block;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: monospace;
    font-size: 1.2rem;
    color: var(--bricks-base-600);
}
</style>
