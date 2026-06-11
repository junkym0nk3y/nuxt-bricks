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
                    icon="ph:check-circle"
                />

                <BricksIcon v-else :class="$style.icon" icon="ph:x-circle" />
            </div>

            <ToastTitle :class="$style.message">
                {{ props.message }}
            </ToastTitle>

            <ToastClose :class="$style.closeButton" aria-label="Close">
                <BricksIcon icon="gl:close" />
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
    padding: 1.2rem 1.6rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--bricks-primary);
    color: var(--bricks-base-0);
    gap: 1.2rem;
    box-shadow: var(--shadow-md);
    user-select: none;

    &._success {
        background-color: var(--bricks-primary);
    }

    &._error {
        background-color: var(--bricks-danger-500);
    }
}

.iconWrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 2.4rem;
    height: 2.4rem;
}

.icon {
    width: 2.4rem;
    height: 2.4rem;
}

.message {
    flex: 1;
    font-size: 1.4rem;
    line-height: 1.4;
}

.closeButton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.4rem;
    height: 2.4rem;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: inherit;
    transition: background-color 0.2s ease;
    cursor: pointer;

    &:hover {
        background-color: var(--overlay-light);
    }
}
</style>
