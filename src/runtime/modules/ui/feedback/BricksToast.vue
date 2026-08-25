<script setup lang="ts">
/**
 * @description Toast: a short report plus an optional action, on top of the reka
 * toast.
 *
 * The keyframes live in the module block on purpose: CSS Modules scopes the
 * animation name in the `animation:` reference, so the definition has to be local
 * too. A global name would not match, the animation would never play, and Reka
 * would hang on `closed` waiting for `animationend`. Under
 * `prefers-reduced-motion` every state becomes `animation: none`, which is safe
 * for `closed` as well: without an animation Presence unmounts the content right
 * away and never waits for `animationend`.
 */

// #region Imports
// Types
import type { IBricksToastEmits, IBricksToastProps } from './types.d.ts';

// Vue
import { computed, useCssModule } from 'vue';
import { useI18n } from 'vue-i18n';

// Reka UI
import {
    ToastProvider,
    ToastRoot,
    ToastTitle,
    ToastAction,
    ToastClose,
    ToastViewport,
} from 'reka-ui';
// #endregion

// #region Constants
/** Duration for toasts that do not auto-hide ("infinity" in practice) */
const PERSISTENT_DURATION = 1_000_000_000;

/** Icon per variant — instead of branching in the markup */
const VARIANT_ICONS: Record<NonNullable<IBricksToastProps['variant']>, string> = {
    success: 'ta:outline-circle-check',
    error: 'ta:outline-circle-x',
    info: 'ta:outline-info-circle',
};
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksToastProps>(), {
    variant: 'success',
    autoHide: true,
    duration: 4000,
    actionLabel: '',
});
// #endregion

// #region Emits
const emit = defineEmits<IBricksToastEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const $style = useCssModule();

/** The close came from Escape — see `onEscapeKeyDown` */
let isEscapeClose = false;
// #endregion

// #region Computed
const hasAction = computed<boolean>(() => Boolean(props.actionLabel));

const toastClasses = computed(() => [
    $style.BricksToast,
    {
        [$style._success]: props.variant === 'success',
        [$style._error]: props.variant === 'error',
        [$style._info]: props.variant === 'info',
        [$style._actionable]: hasAction.value,
    },
]);

const variantIcon = computed<string>(() => VARIANT_ICONS[props.variant]);

/**
 * Auto-hide duration for the Reka ToastRoot. With autoHide=false (or a
 * non-positive duration) the toast stays open.
 */
const resolvedDuration = computed(() =>
    props.autoHide && props.duration > 0 ? props.duration : PERSISTENT_DURATION
);
// #endregion

// #region Methods
/**
 * Passes a toast close (by timer, swipe or button) outwards.
 *
 * @param open - Whether the toast is open after the state change.
 */
function onOpenChange(open: boolean): void {
    if (open) {
        return;
    }

    // A toast waiting for an answer ignores a close by Escape: `open` is
    // controlled by a prop, so without an answer going out it simply stays put
    if (isEscapeClose) {
        isEscapeClose = false;
        return;
    }

    emit('update:visible', false);
}

/**
 * Raises a press of the action button.
 */
function onAction(): void {
    emit('action');
}

/**
 * Raises a click on the toast body. Reka has no such event, so the root is what we
 * listen to: the close button and the action button stop propagation themselves —
 * otherwise a close and an action would arrive here as well.
 */
function onSelect(): void {
    if (!hasAction.value) {
        return;
    }

    emit('select');
}

/**
 * Takes away Escape's right to close a toast that is waiting for an answer. Reka
 * attaches its handler globally, without checking focus (`ToastRootImpl`), so an
 * Escape pressed anywhere — in the canvas or in an open modal — would carry the
 * pending question away with it. The rule leaves auto-hiding toasts alone: their
 * disappearance is a matter of seconds anyway.
 *
 * The event itself is not canceled: `DismissableLayer` checks `defaultPrevented`
 * too, so canceling would leave an open modal impossible to close. Instead the
 * source is marked and our own close is swallowed in `onOpenChange`.
 */
function onEscapeKeyDown(): void {
    if (props.autoHide) {
        return;
    }

    isEscapeClose = true;
}
// #endregion
</script>

<template>
    <ToastProvider>
        <ToastRoot
            :open="props.visible"
            :duration="resolvedDuration"
            :class="toastClasses"
            @update:open="onOpenChange"
            @escape-key-down="onEscapeKeyDown"
            @click="onSelect"
        >
            <div :class="$style.iconWrapper">
                <BricksIcon :class="$style.icon" :icon="variantIcon" />
            </div>

            <ToastTitle :class="$style.message">
                {{ props.message }}
            </ToastTitle>

            <ToastAction
                v-if="hasAction"
                :alt-text="props.actionLabel"
                :class="$style.actionButton"
                @click.stop="onAction"
            >
                {{ props.actionLabel }}
            </ToastAction>

            <ToastClose
                :class="$style.closeButton"
                :aria-label="t('bricks.common.close')"
                @click.stop
            >
                <BricksIcon icon="ta:outline-x" />
            </ToastClose>
        </ToastRoot>

        <ToastViewport :class="$style.viewport" />
    </ToastProvider>
</template>

<style module lang="scss">
.viewport {
    position: fixed;
    right: 2.4rem;
    bottom: 2.4rem;
    z-index: var(--bricks-z-toast);
    display: flex;
    margin: 0;
    padding: 0;
    outline: none;
    list-style: none;
    flex-direction: column;
    gap: 1.2rem;
}

.BricksToast {
    display: flex;
    align-items: center;
    max-width: min(38rem, calc(100vw - 4.8rem));
    padding: 1.2rem;
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid var(--bricks-base-200);
    background-color: var(--bricks-base-0);
    color: var(--bricks-base-900);
    gap: 1.2rem;
    box-shadow: var(--bricks-shadow-lg);
    user-select: none;

    &._success .iconWrapper {
        background-color: var(--bricks-primary-50);
        color: var(--bricks-primary);
    }

    &._error .iconWrapper {
        background-color: var(--bricks-danger-50);
        color: var(--bricks-danger-500);
    }

    &._info .iconWrapper {
        background-color: var(--bricks-surface-raised);
        color: var(--bricks-base-600);
    }

    &._actionable {
        cursor: pointer;

        &:hover {
            border-color: var(--bricks-base-300);
        }
    }

    &[data-state='open'] {
        animation: bricks-toast-in 200ms ease-out;
    }

    &[data-state='closed'] {
        animation: bricks-toast-out 150ms ease-in;
    }

    &[data-swipe='move'] {
        transform: translateX(var(--reka-toast-swipe-move-x));
    }

    &[data-swipe='cancel'] {
        transform: translateX(0);
        transition: transform 200ms ease-out;
    }

    &[data-swipe='end'] {
        animation: bricks-toast-swipe-out 150ms ease-in;
    }

    @media (prefers-reduced-motion: reduce) {
        &[data-state='open'],
        &[data-state='closed'],
        &[data-swipe='end'] {
            animation: none;
        }
    }
}

.iconWrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 2.8rem;
    height: 2.8rem;
    border-radius: var(--bricks-border-radius-control);
}

.icon {
    width: 1.8rem;
    height: 1.8rem;
}

.message {
    flex: 1;
    font-size: 1.4rem;
    font-weight: 500;
    line-height: 1.4;
}

.actionButton {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    height: 2.8rem;
    padding: 0 1.2rem;
    border-radius: var(--bricks-border-radius-control);
    border: 1px solid var(--bricks-base-200);
    background: transparent;
    font-size: var(--bricks-font-size-sm);
    font-weight: 500;
    color: var(--bricks-base-900);
    transition:
        background-color var(--bricks-default-transition),
        border-color var(--bricks-default-transition);
    cursor: pointer;

    &:hover {
        border-color: var(--bricks-base-300);
        background-color: var(--bricks-surface-raised);
    }

    &:focus-visible {
        outline: none;
        box-shadow: var(--bricks-shadow-focus);
    }
}

.closeButton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 2.4rem;
    height: 2.4rem;
    border-radius: var(--bricks-border-radius-control);
    border: none;
    background: transparent;
    color: var(--bricks-base-400);
    transition:
        background-color var(--bricks-default-transition),
        color var(--bricks-default-transition);
    cursor: pointer;

    svg {
        width: 1.4rem;
        height: 1.4rem;
    }

    &:hover {
        background-color: var(--bricks-surface-raised);
        color: var(--bricks-base-900);
    }

    &:focus-visible {
        outline: none;
        box-shadow: var(--bricks-shadow-focus);
    }
}

@keyframes bricks-toast-in {
    from {
        opacity: 0;
        transform: translateY(0.8rem) scale(0.97);
    }

    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

@keyframes bricks-toast-out {
    from {
        opacity: 1;
    }

    to {
        opacity: 0;
        transform: translateY(0.4rem);
    }
}

@keyframes bricks-toast-swipe-out {
    from {
        opacity: 1;
        transform: translateX(var(--reka-toast-swipe-end-x));
    }

    to {
        opacity: 0;
        transform: translateX(calc(var(--reka-toast-swipe-end-x) + 2.4rem));
    }
}
</style>
