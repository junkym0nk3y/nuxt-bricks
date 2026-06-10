<script setup lang="ts">
// #region Imports
// Vue
import { computed, useCssModule } from 'vue';
// #endregion

// #region Props
interface ILandingMediaProps {
    src?: string;
    alt?: string;
    type?: 'image' | 'video';
    objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
    width?: string | number;
    height?: string | number;
    borderRadius?: string | number;
    autoplay?: boolean;
    loop?: boolean;
    muted?: boolean;
    controls?: boolean;
}

const props = withDefaults(defineProps<ILandingMediaProps>(), {
    src: '',
    alt: 'Media',
    type: 'image',
    objectFit: 'cover',
    width: '100%',
    height: 'auto',
    borderRadius: 0,
    autoplay: false,
    loop: false,
    muted: true,
    controls: true,
});
// #endregion

// #region Data
const $style = useCssModule();
// #endregion

// #region Computed
const mediaStyle = computed(() => {
    const style: Record<string, string> = {
        objectFit: props.objectFit,
    };

    if (props.width) {
        style.width = typeof props.width === 'number' ? `${props.width}rem` : props.width;
    }

    if (props.height && props.height !== 'auto') {
        style.height = typeof props.height === 'number' ? `${props.height}rem` : props.height;
    }

    if (props.borderRadius) {
        style.borderRadius =
            typeof props.borderRadius === 'number'
                ? `${props.borderRadius}rem`
                : props.borderRadius;
    }

    return style;
});

const isVideo = computed(() => props.type === 'video');
const isImage = computed(() => props.type === 'image');
const hasSource = computed(() => Boolean(props.src));
// #endregion
</script>

<template>
    <div :class="$style.BricksMedia">
        <!-- Image -->
        <img
            v-if="isImage && hasSource"
            :src="src"
            :alt="alt"
            :class="$style.media"
            :style="mediaStyle"
            loading="lazy"
        />

        <!-- Video -->
        <video
            v-else-if="isVideo && hasSource"
            :src="src"
            :class="$style.media"
            :style="mediaStyle"
            :autoplay="autoplay"
            :loop="loop"
            :muted="muted"
            :controls="controls"
            playsinline
        />

        <!-- Placeholder -->
        <div v-else :class="$style.placeholder">
            <BricksLandIcon
                :class="$style.placeholderIcon"
                :icon="isVideo ? 'md:sharp-video-library' : 'md:outlined-image'"
            />
            <span :class="$style.placeholderText">
                {{ isVideo ? 'No video selected' : 'No image selected' }}
            </span>
        </div>
    </div>
</template>

<style module lang="scss">
.BricksMedia {
    position: relative;
    display: flex;
    width: 100%;
}

.media {
    display: block;
    width: 100%;
    height: 100%;
}

.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 20rem;
    border-radius: 0.8rem;
    border: 0.2rem dashed var(--land-base-300);
    background: var(--land-base-50);
    text-align: center;
    flex-direction: column;
    gap: 1.2rem;
}

.placeholderIcon {
    font-size: 6.4rem;
    color: var(--land-base-300);
}

.placeholderText {
    font-size: 1.4rem;
    color: var(--land-base-500);
}
</style>
