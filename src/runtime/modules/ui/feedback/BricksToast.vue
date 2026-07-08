<script setup lang="ts">
// #region Imports
// Vue
import { computed, useCssModule } from 'vue';

// Reka UI
import { ToastProvider, ToastRoot, ToastTitle, ToastClose, ToastViewport } from 'reka-ui';
// #endregion

// #region Constants
/** Длительность для не-автоскрывающихся тостов (фактически «бесконечность»). */
const PERSISTENT_DURATION = 1_000_000_000;
// #endregion

// #region Props
const props = withDefaults(
    defineProps<{
        visible: boolean;
        message: string;
        variant?: 'success' | 'error';
        autoHide?: boolean;
        duration?: number;
    }>(),
    {
        variant: 'success',
        autoHide: true,
        duration: 4000,
    }
);
// #endregion

// #region Emits
const emit = defineEmits<{
    'update:visible': [value: boolean];
}>();
// #endregion

// #region Data
const $style = useCssModule();
// #endregion

// #region Computed
const toastClasses = computed(() => [
    $style.BricksToast,
    {
        [$style._success]: props.variant === 'success',
        [$style._error]: props.variant === 'error',
    },
]);

/**
 * Длительность авто-скрытия для Reka ToastRoot.
 * При autoHide=false (или неположительной duration) тост остаётся открытым.
 */
const resolvedDuration = computed(() =>
    props.autoHide && props.duration > 0 ? props.duration : PERSISTENT_DURATION
);
// #endregion

// #region Methods
/**
 * Пробрасывает закрытие тоста (по таймеру, свайпу или кнопке) наружу.
 *
 * @param open - Открыт ли тост после изменения состояния.
 */
function onOpenChange(open: boolean): void {
    if (!open) {
        emit('update:visible', false);
    }
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
        >
            <div :class="$style.iconWrapper">
                <BricksIcon
                    v-if="props.variant === 'success'"
                    :class="$style.icon"
                    icon="ta:outline-circle-check"
                />

                <BricksIcon v-else :class="$style.icon" icon="ta:outline-circle-x" />
            </div>

            <ToastTitle :class="$style.message">
                {{ props.message }}
            </ToastTitle>

            <ToastClose :class="$style.closeButton" aria-label="Close">
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
    z-index: 100001;
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
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--bricks-base-200);
    background-color: var(--bricks-base-0);
    color: var(--bricks-base-900);
    gap: 1.2rem;
    box-shadow: var(--shadow-lg);
    user-select: none;

    &._success .iconWrapper {
        background-color: var(--bricks-primary-50);
        color: var(--bricks-primary);
    }

    &._error .iconWrapper {
        background-color: var(--bricks-danger-50);
        color: var(--bricks-danger-500);
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

    // animation: none безопасен и для closed — без анимации Presence
    // размонтирует контент сразу, ожидания animationend нет
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
    border-radius: var(--border-radius-control);
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

.closeButton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 2.4rem;
    height: 2.4rem;
    border-radius: var(--border-radius-control);
    border: none;
    background: transparent;
    color: var(--bricks-base-400);
    transition:
        background-color var(--default-transition),
        color var(--default-transition);
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
        box-shadow: var(--shadow-focus);
    }
}

// Keyframes держим в module-блоке: CSS Modules скоупит имя анимации в ссылке
// `animation:` выше, поэтому и определение должно быть локальным (глобальное
// имя не совпало бы → анимация не проигрывалась, а Reka зависал бы на closed).
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
