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
    DialogDescription,
    VisuallyHidden,
} from 'reka-ui';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksModalProps>(), {
    variant: 'dark',
    padded: false,
    zIndex: 1000,
    duration: 300,
    description: '',
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
 * Классы корневой обёртки: центрирование + вариант фона + опциональный padding.
 */
const rootClasses = computed(() => [
    $style.BricksModal,
    {
        [$style._gradient]: props.variant === 'gradient',
        [$style._padded]: props.padded,
    },
]);

/**
 * Без description явно сбрасываем aria-describedby (undefined снимает атрибут
 * и внутреннюю привязку Reka) — иначе Reka предупреждает про DialogContent
 * без DialogDescription. С description — не вмешиваемся, Reka свяжет id сама.
 */
const contentAria = computed<Record<string, undefined>>(() =>
    props.description ? {} : { 'aria-describedby': undefined }
);
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
            <Transition name="bricks-modal-fade" :duration="props.duration">
                <!--
                    DialogContent не должен быть вложен в DialogOverlay: overlay Reka
                    делает preventDefault на левый pointerdown, и вложенный контент
                    теряет фокус/выделение мышью. Центрирует обычный div, overlay —
                    прозрачная клик-ловушка под контентом.
                -->
                <div v-if="props.isOpen" :class="rootClasses" :style="{ zIndex: props.zIndex }">
                    <DialogOverlay force-mount :class="$style.overlay" />
                    <DialogContent
                        force-mount
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
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--bricks-overlay-dark);

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

    // Под контентом (в стеке корня), но над фоном корня — клик по фону закрывает модалку
    z-index: -1;
    inset: 0;
}

.content {
    display: contents;
}
</style>
