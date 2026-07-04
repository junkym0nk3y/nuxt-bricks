<script setup lang="ts">
// #region Imports
// Types
import type { IMediaItem } from '../../../common/types/media';
import type { IMediaGalleryGridProps, IMediaGalleryGridEmits } from '../types/media';

// Vue
import { useI18n } from 'vue-i18n';

// Utils
import { formatFileSize } from '../utils/formatFileSize';
// #endregion

// #region Props
const props = withDefaults(defineProps<IMediaGalleryGridProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IMediaGalleryGridEmits>();
// #endregion

// #region Data
const { t } = useI18n();
// #endregion

// #region Methods
/** Эмитит выбор элемента галереи. */
function handleSelectItem(item: IMediaItem): void {
    emit('select', item);
}

/** Эмитит открытие полноэкранного предпросмотра. */
function handleOpenPreview(item: IMediaItem): void {
    emit('preview', item);
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderMediaGalleryGrid">
        <div
            v-for="item in props.items"
            :key="item.id"
            :class="[$style.galleryItem, { [$style.selected]: props.selectedItemId === item.id }]"
            @click="handleSelectItem(item)"
        >
            <div :class="$style.imageWrapper">
                <div v-if="item.mimeType.startsWith('video/')" :class="$style.videoPlaceholder">
                    <BricksIcon :class="$style.videoPlayIcon" icon="md:sharp-video-library" />
                </div>
                <img
                    v-else
                    :src="item.url"
                    :alt="item.alt || item.filename"
                    :class="$style.image"
                    loading="lazy"
                    decoding="async"
                />
                <button
                    type="button"
                    :class="$style.previewBtn"
                    :title="t('bricks.media.fullscreen')"
                    @click.stop="handleOpenPreview(item)"
                >
                    <BricksIcon icon="ph:magnifying-glass" />
                </button>
            </div>
            <div :class="$style.itemInfo">
                <span :class="$style.filename">{{ item.filename }}</span>
                <span :class="$style.filesize">{{ formatFileSize(item.size) }}</span>
                <span :class="$style.categoryBadge">{{ item.category }}</span>
            </div>
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderMediaGalleryGrid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
    gap: 1.6rem;
    margin-top: 2rem;
}

.galleryItem {
    --bricks-base-0: #fff;
    --bricks-base-200: #e5e7eb;
    --bricks-base-500: #6b7280;
    --bricks-base-600: #4b5563;
    --bricks-base-900: #111827;

    position: relative;
    overflow: hidden;
    border-radius: var(--border-radius-md);
    border: 0.2rem solid transparent;
    background: var(--bricks-base-0);
    transition: all 200ms ease;
    cursor: pointer;

    &:hover {
        border-color: var(--bricks-primary-300);
        box-shadow: var(--shadow-md);
    }

    &.selected {
        border-color: var(--bricks-primary-500);
        box-shadow: 0 0 0 0.4rem rgb(var(--rgb-primary-500) / 20%);
    }
}

.imageWrapper {
    position: relative;

    &:hover .previewBtn {
        opacity: 1;
    }
}

.image {
    display: block;
    width: 100%;
    height: 12rem;
    object-fit: scale-down;
}

.videoPlaceholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 12rem;
    background: var(--bricks-base-100, #f3f4f6);
}

.videoPlayIcon {
    font-size: 4rem;
    color: var(--bricks-base-400);
}

.previewBtn {
    position: absolute;
    top: 0.6rem;
    right: 0.6rem;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3.2rem;
    height: 3.2rem;
    padding: 0;
    border-radius: 0.6rem;
    border: none;
    background: rgb(0 0 0 / 50%);
    font-size: 1.6rem;
    color: #fff;
    opacity: 0;
    transition: opacity 150ms ease;
    cursor: pointer;

    &:hover {
        background: rgb(0 0 0 / 70%);
    }
}

.itemInfo {
    display: flex;
    padding: 1rem;
    flex-direction: column;
    gap: 0.4rem;
}

.categoryBadge {
    align-self: flex-start;
    padding: 0.2rem 0.8rem;
    border-radius: 999px;
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    text-transform: capitalize;
    font-size: 1.2rem;
    color: var(--bricks-base-600);
}

.filename {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.4rem;
    font-weight: 500;
    color: var(--bricks-base-900);
}

.filesize {
    font-size: 1.2rem;
    color: var(--bricks-base-500);
}
</style>
