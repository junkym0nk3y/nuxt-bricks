<script setup lang="ts">
/**
 * @description The optimization parameters cog with its popover.
 *
 * A component of its own, because it has two places: the upload controls in the header
 * of the modal and the row of filters of the dashboard section, where the parameters
 * stand next to the actions over the categories. A second copy of this wiring would
 * drift away from the first: the anchoring of the popover here is not obvious and has
 * cost debugging once already.
 *
 * That anchoring is the explicit `PopoverAnchor`, and it is a must: the `as-child` of
 * the trigger hands its handlers to the tooltip WRAPPER inside the kit button, so with
 * no anchor the popover has nothing to take as its point of attachment — the content
 * opened past the top edge of the window. The click kept working all the while, so the
 * breakage looked like "the popover does not open". `aria-expanded` stays on the button
 * itself: it is put there by the `expanded` prop rather than by the trigger, because
 * the wrapper takes no focus and a screen reader would not read an expansion announced
 * on it.
 *
 * The content is composed through `as-child` for the reason `BricksPopoverSurface`
 * gives. The animation of the style section hangs on `data-state` rather than on a Vue
 * transition because it is reka that owns the presence of the content, and it waits the
 * CSS animation out before unmounting; the look, the layer and the border arrive from
 * the surface, while the width and the padding come from the parameters panel itself
 * (the density scale of the surface holds no `1.6rem`).
 */

// #region Imports
// Types
import type { IBricksMediaOptimization } from '../../../common/types/media';
import type {
    IMediaGalleryUploadOptionsPopoverProps,
    IMediaGalleryUploadOptionsPopoverEmits,
} from '../types/media';

// Vue
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Reka UI
import { PopoverAnchor, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui';

// Components
import BricksIconButton from '../../../ui/base/icon-button/BricksIconButton.vue';
import BricksPopoverSurface from '../../../ui/base/popover/BricksPopoverSurface.vue';
import BuilderMediaGalleryUploadOptions from './BuilderMediaGalleryUploadOptions.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IMediaGalleryUploadOptionsPopoverProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IMediaGalleryUploadOptionsPopoverEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const isOpen = ref(false);
// #endregion

// #region Methods
/**
 * Passes the changed parameters upward.
 *
 * @param value - The new optimization parameters.
 */
function handleOptimizationChange(value: IBricksMediaOptimization): void {
    emit('update:optimization', value);
}
// #endregion
</script>

<template>
    <PopoverRoot v-model:open="isOpen">
        <PopoverAnchor>
            <PopoverTrigger as-child>
                <BricksIconButton
                    icon="ta:outline-settings"
                    :label="t('bricks.media.upload.optionsTitle')"
                    variant="ghost"
                    size="lg"
                    :active="isOpen"
                    :expanded="isOpen"
                    :tooltip-side="props.tooltipSide"
                />
            </PopoverTrigger>
        </PopoverAnchor>

        <PopoverPortal>
            <PopoverContent as-child align="end" :side-offset="8">
                <BricksPopoverSurface density="flush" elevation="lg" :class="$style.popover">
                    <BuilderMediaGalleryUploadOptions
                        :optimization="props.optimization"
                        :configured-max-width="props.configuredMaxWidth"
                        @update:optimization="handleOptimizationChange"
                    />
                </BricksPopoverSurface>
            </PopoverContent>
        </PopoverPortal>
    </PopoverRoot>
</template>

<style module lang="scss">
.popover {
    &[data-state='open'] {
        animation: options-popover-in var(--bricks-default-transition);
    }

    &[data-state='closed'] {
        animation: options-popover-out 150ms ease;
    }
}

@keyframes options-popover-in {
    from {
        opacity: 0;
        transform: translateY(-0.4rem);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes options-popover-out {
    from {
        opacity: 1;
    }

    to {
        opacity: 0;
    }
}
</style>
