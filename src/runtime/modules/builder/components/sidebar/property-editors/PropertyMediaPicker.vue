<script setup lang="ts">
// #region Imports
// Vue
import { computed } from 'vue';

// Components
import BricksButton from '../../../../ui/base/button/BricksButton.vue';
// #endregion

// #region Props
interface IPropertyMediaPickerProps {
    modelValue?: string;
    label?: string;
    type?: 'image' | 'video';
}

const props = withDefaults(defineProps<IPropertyMediaPickerProps>(), {
    modelValue: '',
    label: 'Media',
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

// #region Computed
const hasMedia = computed(() => Boolean(props.modelValue));
const mediaType = computed(() => props.type);
const previewIcon = computed(() =>
    props.type === 'video' ? 'md:sharp-video-library' : 'md:outlined-image'
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
    <div :class="$style.PropertyMediaPicker">
        <label v-if="label" :class="$style.label">{{ label }}</label>

        <!-- Media Preview -->
        <div :class="$style.preview">
            <!-- Image Preview -->
            <img
                v-if="hasMedia && mediaType === 'image'"
                :src="modelValue"
                :class="$style.previewImage"
                alt="Preview"
            />

            <!-- Video Preview -->
            <video
                v-else-if="hasMedia && mediaType === 'video'"
                :src="modelValue"
                :class="$style.previewImage"
                muted
                playsinline
            />

            <!-- Empty State -->
            <div v-else :class="$style.previewEmpty">
                <BricksIcon :class="$style.previewIcon" :icon="previewIcon" />
            </div>
        </div>

        <!-- Actions -->
        <div :class="$style.actions">
            <BricksButton
                size="sm"
                variant="primary"
                :class="$style.button"
                @click="handleOpenGallery"
            >
                <BricksIcon icon="md:folder-open" />
                Выбрать
            </BricksButton>

            <BricksButton
                v-if="hasMedia"
                size="sm"
                variant="danger"
                :class="$style.button"
                @click="handleRemove"
            >
                <BricksIcon icon="md:delete" />
                Удалить
            </BricksButton>
        </div>

        <!-- URL Display -->
        <div v-if="hasMedia" :class="$style.urlDisplay">
            <span :class="$style.url">{{ modelValue }}</span>
        </div>
    </div>
</template>

<style module lang="scss">
.PropertyMediaPicker {
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
    /* Фиксируем светлую тему для области превью */
    --bricks-base-50: #f9fafb;
    --bricks-base-300: #d1d5db;

    overflow: hidden;
    width: 100%;
    height: 16rem;
    border-radius: 0.8rem;
    border: 0.2rem solid var(--bricks-base-300);
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
