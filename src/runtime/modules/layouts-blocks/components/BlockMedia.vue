<script setup lang="ts">
// #region Imports
// Types
import type { IAppConfig, TBricksMediaLoadMode } from '../../common/types/config';
import type { IBlockMediaProps } from '../types/blockProps';

// Nuxt
import { useAppConfig } from 'nuxt/app';

// Vue
import { computed, useCssModule } from 'vue';

// Components
import BricksImage from '../../ui/base/image/BricksImage.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBlockMediaProps>(), {
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
    previewSrc: '',
    mockSrc: '',
    naturalWidth: 0,
    naturalHeight: 0,
    loadMode: 'config',
    eagerLoad: false,
});
// #endregion

// #region Data
const $style = useCssModule();
const appConfig = useAppConfig() as IAppConfig;
/** The default for when neither the block nor the config has set a mode */
const FALLBACK_LOAD_MODE: TBricksMediaLoadMode = 'two-step';
// #endregion

// #region Computed
/**
 * Sizing styles of the media. They go onto the BricksImage root rather than onto the
 * picture itself: progressive loading is BricksImage's job and its layers are absolutely
 * positioned, so the wrapper is the element that has to carry a size.
 */
const mediaStyle = computed(() => {
    // The fit is read out of the variable of the device with the base prop as the
    // fallback: the published page picks the value by a media query, and the layers of
    // BricksImage sit outside the reach of an `object-fit` set on their wrapper, so the
    // same chain is handed to them through `--bricks-image-fit`
    const fit = `var(--bricks-media-fit, ${props.objectFit})`;
    const style: Record<string, string> = {
        objectFit: fit,
        '--bricks-image-fit': fit,
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
/** `config` on the block means "take the global default of the module" */
const resolvedLoadMode = computed<TBricksMediaLoadMode>(() =>
    props.loadMode === 'config'
        ? (appConfig.bricks?.media?.loadMode ?? FALLBACK_LOAD_MODE)
        : props.loadMode
);
// #endregion
</script>

<template>
    <div :class="$style.BlockMedia">
        <BricksImage
            v-if="isImage && hasSource"
            :src="props.src"
            :alt="props.alt"
            :preview-src="props.previewSrc || null"
            :mock-src="props.mockSrc || null"
            :mode="resolvedLoadMode"
            :eager="props.eagerLoad"
            :fit="props.objectFit"
            :natural-width="props.naturalWidth || null"
            :natural-height="props.naturalHeight || null"
            :class="$style.media"
            :style="mediaStyle"
        />

        <video
            v-else-if="isVideo && hasSource"
            :src="props.src"
            :class="$style.media"
            :style="mediaStyle"
            :autoplay="props.autoplay"
            :loop="props.loop"
            :muted="props.muted"
            :controls="props.controls"
            playsinline
        />

        <div v-else :class="$style.placeholder">
            <BricksIcon
                :class="$style.placeholderIcon"
                :icon="isVideo ? 'ta:outline-video' : 'ta:outline-photo'"
            />
            <span :class="$style.placeholderText">
                {{ isVideo ? 'No video selected' : 'No image selected' }}
            </span>
        </div>
    </div>
</template>

<style module lang="scss">
.BlockMedia {
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
    border: 0.2rem dashed var(--bricks-base-300);
    background: var(--bricks-base-50);
    text-align: center;
    flex-direction: column;
    gap: 1.2rem;
}

.placeholderIcon {
    font-size: 6.4rem;
    color: var(--bricks-base-300);
}

.placeholderText {
    font-size: 1.4rem;
    color: var(--bricks-base-500);
}
</style>
