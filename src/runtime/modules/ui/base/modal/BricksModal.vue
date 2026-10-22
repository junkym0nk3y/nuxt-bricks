<script setup lang="ts">
/**
 * @description Modal window: a reka dialog plus the overlay, the layer and the
 * appearance transition.
 *
 * Three markup decisions that the template no longer spells out.
 *
 * `appear` on the `<Transition>` is mandatory: modals with lazy mounting (the
 * profile, the media gallery) show up in the host markup already open — the mount
 * latch and `isOpen` are raised by one and the same action, and the chunk arrives
 * even later. Without `appear` the first opening of such a modal ran with no
 * animation at all while the second one had it: on an already mounted component
 * `isOpen` changes the regular way.
 *
 * `DialogContent` must not be nested inside `DialogOverlay`: the reka overlay
 * calls `preventDefault` on a left `pointerdown`, and nested content loses focus
 * and mouse selection. An ordinary div does the centering, while the overlay is a
 * transparent click trap underneath the content — hence its `z-index: -1`, below
 * the content in the root's stack but above the root's own background, so a click
 * on the background closes the modal.
 *
 * `bricks-modal-window` is a global class by convention, the anchor for the
 * window scale from `transitions.scss`: `DialogContent` itself stands with
 * `display: contents`, so what has to be animated are its children, and a hashed
 * CSS Modules name is out of reach for the global transitions file.
 */

// #region Imports
// Types
import type { IBricksModalProps, IBricksModalEmits } from './types.d.ts';

// Utils
import { markLeavingInert } from '../../../common/utils/transitionInert';

// Constants
import { BRICKS_MODAL_TITLE_KEY } from '../../../common/constants/injectionKeys';

// Vue
import { useCssModule, computed, provide } from 'vue';

// Reka UI
import {
    DialogRoot,
    DialogPortal,
    DialogOverlay,
    DialogContent,
    DialogTitle,
    DialogDescription,
    VisuallyHidden,
} from 'reka-ui';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksModalProps>(), {
    variant: 'dark',
    padded: false,
    layer: 'modal',
    duration: 300,
    description: '',
});
// #endregion

// #region Emits
const emit = defineEmits<IBricksModalEmits>();
// #endregion

// #region Data
const $style = useCssModule();

/**
 * The title is handed down to `BricksModalHeader`: the same value goes into the
 * hidden `DialogTitle`, and the visible header has to print exactly that rather
 * than a copy of its own — a dialog name that has drifted from the caption inside
 * it is not visible to any check.
 */
provide(
    BRICKS_MODAL_TITLE_KEY,
    computed(() => props.title)
);
// #endregion

// #region Computed
/**
 * Classes of the root wrapper: centering plus the background variant plus
 * optional padding.
 */
const rootClasses = computed(() => [
    $style.BricksModal,
    {
        [$style._gradient]: props.variant === 'gradient',
        [$style._padded]: props.padded,
        [$style[`_${props.layer}`]]: props.layer !== 'modal',
    },
]);

/**
 * The transition duration goes out into a CSS variable: the same value bounds the
 * `<Transition>`, and without a shared source the window transform
 * (`transitions.scss`) would run on a constant of its own — on modals with a
 * shortened transition Vue would strip the classes before the scale finished
 * playing, and the window would arrive with a jump.
 */
const rootStyle = computed<Record<string, string>>(() => ({
    '--bricks-modal-duration': `${props.duration}ms`,
}));

/**
 * Without a description, aria-describedby is cleared explicitly (`undefined`
 * removes both the attribute and Reka's internal binding) — otherwise Reka warns
 * about a DialogContent without a DialogDescription. With a description we do not
 * interfere: Reka binds the id itself.
 */
const contentAria = computed<Record<string, undefined>>(() =>
    props.description ? {} : { 'aria-describedby': undefined }
);
// #endregion

// #region Methods
/**
 * Passes the close outwards (Esc, a click on the overlay). The state is
 * controlled — the modal closes only if the parent updates isOpen.
 *
 * @param open - New open state from Reka.
 */
function onUpdateOpen(open: boolean): void {
    if (!open) {
        emit('close');
    }
}

/**
 * Kills the modal's interactivity for the duration of the leave animation.
 * `force-mount` keeps `DialogContent` in the DOM until it ends, so the buttons of
 * a departing modal stay activatable — from the keyboard and from assistive tech
 * included — while `pointer-events` (`transitions.scss`) closes off the pointer
 * only. A click on an already answered modal would answer for the next one.
 *
 * @param element - Root element of the departing modal.
 */
function onLeave(element: Element): void {
    markLeavingInert(element);
}
// #endregion
</script>

<template>
    <DialogRoot :open="props.isOpen" @update:open="onUpdateOpen">
        <DialogPortal>
            <Transition
                appear
                name="bricks-modal-fade"
                :duration="props.duration"
                @leave="onLeave"
                @after-leave="emit('afterLeave')"
            >
                <div v-if="props.isOpen" :class="rootClasses" :style="rootStyle">
                    <DialogOverlay force-mount :class="$style.overlay" />

                    <DialogContent
                        force-mount
                        class="bricks-modal-window"
                        :class="$style.content"
                        v-bind="contentAria"
                        @escape-key-down="emit('escapeKeyDown', $event)"
                    >
                        <VisuallyHidden>
                            <DialogTitle>{{ props.title }}</DialogTitle>
                            <DialogDescription v-if="props.description">
                                {{ props.description }}
                            </DialogDescription>
                        </VisuallyHidden>

                        <slot />
                    </DialogContent>
                </div>
            </Transition>
        </DialogPortal>
    </DialogRoot>
</template>

<style module lang="scss">
.BricksModal {
    position: fixed;
    z-index: var(--bricks-z-modal);
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--bricks-overlay-dark);

    &._nested {
        z-index: var(--bricks-z-modal-nested);
    }

    &._raised {
        z-index: var(--bricks-z-modal-raised);
    }

    &._confirm {
        z-index: var(--bricks-z-modal-confirm);
    }

    &._gradient {
        background: linear-gradient(
            180deg,
            var(--bricks-overlay-modal-start),
            var(--bricks-overlay-modal-end)
        );
    }

    &._padded {
        padding: 2rem;
    }
}

.overlay {
    position: fixed;
    z-index: -1;
    inset: 0;
}

.content {
    display: contents;
}
</style>
