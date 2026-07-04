<script setup lang="ts">
// #region Imports
// Types
import type { IMediaGalleryUploadAreaProps, IMediaGalleryUploadAreaEmits } from '../types/media';

// Vue
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IMediaGalleryUploadAreaProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IMediaGalleryUploadAreaEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const fileInputRef = ref<HTMLInputElement | null>(null);
const dragOver = ref(false);
// #endregion

// #region Methods
/** Opens file picker. */
function handleOpenFilePicker(): void {
    fileInputRef.value?.click();
}

/** Handles file selection from input. */
function handleFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;

    if (!files || files.length === 0) {
        return;
    }

    emit('upload', Array.from(files));
    input.value = '';
}

/** Handles drag over event. */
function handleDragOver(event: DragEvent): void {
    event.preventDefault();
    dragOver.value = true;
}

/** Handles drag leave event. */
function handleDragLeave(): void {
    dragOver.value = false;
}

/** Handles file drop. */
function handleDrop(event: DragEvent): void {
    event.preventDefault();
    dragOver.value = false;

    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) {
        return;
    }

    emit('upload', Array.from(files));
}
// #endregion
</script>

<template>
    <div
        :class="[$style.BuilderMediaGalleryUploadArea, { [$style.dragOver]: dragOver }]"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
    >
        <input
            ref="fileInputRef"
            type="file"
            accept="image/*,video/*"
            multiple
            :class="$style.fileInput"
            @change="handleFileChange"
        />
        <BricksIcon :class="$style.uploadIcon" icon="md:cloud-upload" />
        <p :class="$style.uploadText">{{ t('bricks.media.dropHint') }}</p>
        <BricksButton size="md" variant="primary" @click="handleOpenFilePicker">
            {{ t('bricks.media.chooseFiles') }}
        </BricksButton>
        <p :class="$style.uploadHint">
            {{
                t('bricks.media.sizeHint', {
                    image: props.maxImageSizeMb,
                    video: props.maxVideoSizeMb,
                })
            }}
        </p>
    </div>
</template>

<style module lang="scss">
.BuilderMediaGalleryUploadArea {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3.2rem 2rem;
    border-radius: var(--border-radius-md);
    border: 0.2rem dashed var(--bricks-base-300);
    background: var(--bricks-base-50);
    transition: all 200ms ease;
    cursor: pointer;
    flex-direction: column;
    gap: 1.2rem;

    &:hover {
        border-color: var(--bricks-primary-400);
        background: var(--bricks-primary-50);
    }

    &.dragOver {
        border-color: var(--bricks-primary-500);
        background: var(--bricks-primary-100);
    }
}

.fileInput {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
}

.uploadIcon {
    font-size: 4.8rem;
    color: var(--bricks-base-400);
}

.uploadText {
    margin: 0;
    font-size: 1.6rem;
    color: var(--bricks-base-600);
}

.uploadHint {
    margin: 0;
    font-size: 1.2rem;
    color: var(--bricks-base-400);
}
</style>
