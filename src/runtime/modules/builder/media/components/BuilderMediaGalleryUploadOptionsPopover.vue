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
const anchorRef = ref<ComponentPublicInstance | null>(null);
// #endregion

// #region Methods
/**
 * The element of the anchor holding the button of the popover.
 *
 * Taken from the anchor rather than from a ref on the button: the button of the kit
 * wraps itself into a tooltip and therefore has several root nodes, so its `$el` is a
 * text node — `querySelector` on it threw, and the focus never came back to the cog.
 *
 * @returns The anchor element, or null while the popover is not mounted.
 */
function resolveAnchorElement(): HTMLElement | null {
    const element = anchorRef.value?.$el;

    return element instanceof HTMLElement ? element : null;
}

/**
 * The button that opens the popover.
 *
 * @returns The button, or null when the anchor is not mounted.
 */
function resolveTriggerButton(): HTMLElement | null {
    return resolveAnchorElement()?.querySelector('button') ?? null;
}

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
    const button = resolveTriggerButton();

    if (!button) {
        return;
    }

    event.preventDefault();
    button.focus();
}
/** Opens and closes the popover from its button */
function handleToggle(): void {
    isOpen.value = !isOpen.value;
}

/**
 * Keeps the dismiss of the popover away from an interaction with its own button.
 *
 * The button is an anchor rather than a `PopoverTrigger` (a trigger would hang
 * `aria-expanded` on the tooltip wrapper instead of the button itself), so opening and
 * closing is the toggle above. To the dismissable layer of an open popover a press on
 * that button reads as a press OUTSIDE the content: it closed the popover by itself,
 * the click then arrived at the toggle, and the toggle opened it again — the button
 * looked like it refused to close.
 *
 * Cancelling the dismiss rather than dropping the toggle: a keyboard press (Enter,
 * Space) produces no pointer event at all, and without the toggle it would have no way
 * of closing the popover. The wider `interactOutside` rather than `pointerDownOutside`:
 * pressing the button moves focus onto it as well, and the layer dismisses on that too.
 *
 * The containment is asked of the anchor rather than of the button: the button of the
 * kit wraps itself into a tooltip, so its own root is not the node a press lands on.
 *
 * @param event - Dismiss event of the layer; cancelled when the interaction came from the anchor.
 */
function handleInteractOutside(event: CustomEvent<{ originalEvent: Event }>): void {
    const node = event.detail.originalEvent.target as Node | null;
    const anchor = resolveAnchorElement();

    if (node && anchor?.contains(node)) {
        event.preventDefault();
    }
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
        <PopoverAnchor ref="anchorRef">
            <BricksIconButton
                icon="ta:outline-settings"
                :label="t('bricks.media.upload.optionsTitle')"
                variant="ghost"
                size="lg"
                :active="isOpen"
                :expanded="isOpen"
                :tooltip-side="props.tooltipSide"
                @click="handleToggle"
            />
        </PopoverAnchor>

        <PopoverPortal>
            <PopoverContent
                as-child
                align="end"
                :side-offset="8"
                :aria-label="t('bricks.media.upload.optionsTitle')"
                @close-auto-focus="handleCloseAutoFocus"
                @interact-outside="handleInteractOutside"
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
