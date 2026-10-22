<script setup lang="ts">
/**
 * @description The drop target for files: it unfolds over the grid while files are
 * being dragged over the modal.
 *
 * It covers the grid alone rather than the whole of the content: the row of filters
 * has to stay visible — it is what tells which category the files will land in. The
 * fill is semi-transparent for the same reason: what the target will put them into
 * has to be readable underneath it.
 *
 * The optimization parameters are printed right here: otherwise the only way to check
 * the quality the files will go with is to open the popover, and during a drag that is
 * no longer possible.
 *
 * Decisions held by the style section. The target takes no place of its own in the
 * flow — it exists only for the duration of a drag — so it lies over the grid
 * absolutely positioned. Its `z-index` is a local layer inside the content of the
 * modal rather than a step of the common `--bricks-z-*` scale: it covers nothing but
 * the grid beneath it. And the message stands on a plate of its own: over a grid
 * showing through, text with no ground of its own reads only half the time — the dark
 * theme especially, where the tiles are lighter than the background.
 */

// #region Imports
// Types
import type { IMediaGalleryDropOverlayProps } from '../types/media';

// Utils
import { formatOptimizationSummary } from '../utils/optimizationSummary';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BricksFieldHint from '../../../ui/inputs/BricksFieldHint.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IMediaGalleryDropOverlayProps>(), {});
// #endregion

// #region Data
const { t } = useI18n();
// #endregion

// #region Computed
const title = computed<string>(() => t('bricks.media.upload.dropNow', { count: props.fileCount }));
const hint = computed<string>(
    () =>
        `${t('bricks.media.sizeHint', {
            image: props.maxImageSizeMb,
            video: props.maxVideoSizeMb,
        })} · ${formatOptimizationSummary(props.optimization, t)}`
);
// #endregion
</script>

<template>
    <div :class="$style.BuilderMediaGalleryDropOverlay">
        <div :class="$style.message">
            <BricksIcon :class="$style.icon" icon="ta:outline-cloud-upload" />
            <span :class="$style.title">{{ title }}</span>
            <BricksFieldHint>{{ hint }}</BricksFieldHint>
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderMediaGalleryDropOverlay {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--bricks-border-radius-md);
    border: 0.2rem dashed var(--bricks-primary);
    background: color-mix(in srgb, var(--bricks-primary-50) 80%, transparent);
    pointer-events: none;
}

.message {
    display: flex;
    align-items: center;
    padding: 1.6rem 2.4rem;
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid var(--bricks-primary-100);
    background: var(--bricks-base-0);
    box-shadow: var(--bricks-shadow-lg);
    text-align: center;
    flex-direction: column;
    gap: 0.6rem;
}

.icon {
    font-size: 3.2rem;
    color: var(--bricks-primary);
}

.title {
    font-size: 1.4rem;
    font-weight: 500;
    color: var(--bricks-primary);
}
</style>
