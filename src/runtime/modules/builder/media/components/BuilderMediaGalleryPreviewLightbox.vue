<script setup lang="ts">
// #region Imports
// Types
import type {
    IMediaGalleryPreviewLightboxProps,
    IMediaGalleryPreviewLightboxEmits,
} from '../types/media';
// #endregion

// #region Props
const props = withDefaults(defineProps<IMediaGalleryPreviewLightboxProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IMediaGalleryPreviewLightboxEmits>();
// #endregion

// #region Methods
/** Закрывает полноэкранный предпросмотр. */
function handleClose(): void {
    emit('close');
}
// #endregion
</script>

<template>
    <Transition name="library-modal-fade">
        <div
            v-if="props.item"
            :class="$style.BuilderMediaGalleryPreviewLightbox"
            @click.self="handleClose"
        >
            <button type="button" :class="$style.previewClose" @click="handleClose">
                <BricksIcon icon="gl:close" />
            </button>
            <video
                v-if="props.item.mimeType.startsWith('video/')"
                :src="props.item.url"
                :class="$style.previewImage"
                controls
                playsinline
            />
            <img
                v-else
                :src="props.item.url"
                :alt="props.item.alt || props.item.filename"
                :class="$style.previewImage"
                decoding="async"
            />
        </div>
    </Transition>
</template>

<style module lang="scss">
.BuilderMediaGalleryPreviewLightbox {
    position: fixed;
    inset: 0;
    z-index: 100000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4rem;
    background: rgb(0 0 0 / 85%);
}

.previewClose {
    position: absolute;
    top: 2rem;
    right: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 4rem;
    height: 4rem;
    padding: 0;
    border-radius: 0.8rem;
    border: none;
    background: rgb(255 255 255 / 15%);
    font-size: 2rem;
    color: #fff;
    transition: background 150ms ease;
    cursor: pointer;

    &:hover {
        background: rgb(255 255 255 / 25%);
    }
}

.previewImage {
    max-width: 100%;
    max-height: 100%;
    border-radius: 0.4rem;
    object-fit: contain;
}
</style>
