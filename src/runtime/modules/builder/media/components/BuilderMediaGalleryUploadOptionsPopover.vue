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
 * breakage looked like "the popover does not open". The opening itself is a plain
 * handler on the button rather than a `PopoverTrigger`: the trigger hands its
 * attributes to that same wrapper, and `aria-expanded` on a node with no role is a
 * broken ARIA structure — axe answers `aria-allowed-attr` on it. The expansion is
 * announced by the `expanded` prop of the button, which puts the attribute on the
 * native control where it belongs.
 *
 * Two things the trigger used to do are therefore done here by hand, and both are
 * load-bearing: the content is named (`aria-label`), because a dialog with no name
 * is announced as an empty one, and the focus goes back to the cog when the popover
 * closes — otherwise a person who opened it from the keyboard is left at the top of
 * the document.
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
import { ref, type ComponentPublicInstance } from 'vue';
import { useI18n } from 'vue-i18n';

// Reka UI
import { PopoverAnchor, PopoverContent, PopoverPortal, PopoverRoot } from 'reka-ui';

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
const triggerRef = ref<ComponentPublicInstance | null>(null);
// #endregion

// #region Methods
/**
 * Returns the focus to the cog when the popover closes.
 *
 * Reka does this itself only for a `PopoverTrigger`, and there is none here — the
 * trigger would hang `aria-expanded` on the tooltip wrapper of the button. The
 * focus is put on the native control inside the wrapper rather than on the wrapper
 * itself: the wrapper takes no focus at all.
 *
 * @param event - The event of the closing focus move, cancelled in favor of ours.
 */
function handleCloseAutoFocus(event: Event): void {
    const button = (triggerRef.value?.$el as HTMLElement | undefined)?.querySelector('button');

    if (!button) {
        return;
    }

    event.preventDefault();
    button.focus();
}
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
            <BricksIconButton
                ref="triggerRef"
                icon="ta:outline-settings"
                :label="t('bricks.media.upload.optionsTitle')"
                variant="ghost"
                size="lg"
                :active="isOpen"
                :expanded="isOpen"
                :tooltip-side="props.tooltipSide"
                @click="isOpen = !isOpen"
            />
        </PopoverAnchor>

        <PopoverPortal>
            <PopoverContent
                as-child
                align="end"
                :side-offset="8"
                :aria-label="t('bricks.media.upload.optionsTitle')"
                @close-auto-focus="handleCloseAutoFocus"
            >
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
