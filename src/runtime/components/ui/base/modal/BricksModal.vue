<script setup lang="ts">
// #region Imports
// Types
import type { IBricksModalProps, IBricksModalEmits } from './types.d.ts';

// Vue
import { useCssModule, computed } from 'vue';

// Reka UI
import {
    DialogRoot,
    DialogPortal,
    DialogOverlay,
    DialogContent,
    DialogTitle,
    VisuallyHidden,
} from 'reka-ui';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksModalProps>(), {
    variant: 'dark',
    padded: false,
    zIndex: 1000,
    duration: 300,
});
// #endregion

// #region Emits
const emit = defineEmits<IBricksModalEmits>();
// #endregion

// #region Data
const $style = useCssModule();
// #endregion

// #region Computed
/**
 * Классы overlay: базовое центрирование + вариант фона + опциональный padding.
 */
const overlayClasses = computed(() => [
    $style.BricksModal,
    {
        [$style._gradient]: props.variant === 'gradient',
        [$style._padded]: props.padded,
    },
]);
// #endregion

// #region Methods
/**
 * Пробрасывает закрытие наружу (Esc, клик по overlay).
 * Состояние контролируемое — модалка закроется, только если родитель обновит isOpen.
 *
 * @param open - Новое состояние открытости от Reka.
 */
function onUpdateOpen(open: boolean): void {
    if (!open) {
        emit('close');
    }
}
// #endregion
</script>

<template>
    <DialogRoot :open="props.isOpen" @update:open="onUpdateOpen">
        <DialogPortal>
            <Transition name="library-modal-fade" :duration="props.duration">
                <DialogOverlay
                    v-if="props.isOpen"
                    force-mount
                    :class="overlayClasses"
                    :style="{ zIndex: props.zIndex }"
                >
                    <DialogContent
                        force-mount
                        :class="$style.content"
                        @escape-key-down="emit('escapeKeyDown', $event)"
                    >
                        <VisuallyHidden>
                            <DialogTitle>{{ props.title }}</DialogTitle>
                        </VisuallyHidden>

                        <slot />
                    </DialogContent>
                </DialogOverlay>
            </Transition>
        </DialogPortal>
    </DialogRoot>
</template>

<style module lang="scss">
.BricksModal {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--overlay-dark);

    &._gradient {
        background: linear-gradient(180deg, var(--overlay-modal-start), var(--overlay-modal-end));
    }

    &._padded {
        padding: 2rem;
    }
}

.content {
    display: contents;
}
</style>
