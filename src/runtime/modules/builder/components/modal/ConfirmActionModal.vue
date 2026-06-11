<script setup lang="ts">
// #region Imports
// Types
import type { IConfirmActionModalEmits, IConfirmActionModalProps } from './types';

// Vue
import { computed } from 'vue';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksCloseButton from '../../../ui/base/modal/BricksCloseButton.vue';
import BricksModal from '../../../ui/base/modal/BricksModal.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IConfirmActionModalProps>(), {
    description: '',
    confirmText: 'Подтвердить',
    cancelText: 'Отмена',
    confirmVariant: 'primary',
    isLoading: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IConfirmActionModalEmits>();
// #endregion

// #region Computed
const normalizedDescription = computed(() => props.description?.trim());
// #endregion

// #region Methods
/**
 * Закрывает модалку подтверждения.
 */
function handleClose(): void {
    if (props.isLoading) {
        return;
    }
    emit('close');
}

/**
 * Подтверждает действие.
 */
function handleConfirm(): void {
    if (props.isLoading) {
        return;
    }
    emit('confirm');
}
// #endregion
</script>

<template>
    <BricksModal
        :is-open="props.isOpen"
        :title="props.title"
        variant="gradient"
        padded
        :z-index="999999"
        :duration="200"
        @close="handleClose"
    >
        <div :class="$style.modal">
            <div :class="$style.header">
                <h3 :class="$style.title">{{ props.title }}</h3>
                <BricksCloseButton :disabled="props.isLoading" @click="handleClose" />
            </div>

            <div v-if="normalizedDescription" :class="$style.content">
                <p :class="$style.description">{{ normalizedDescription }}</p>
            </div>

            <div :class="$style.actions">
                <BricksButton
                    size="sm"
                    variant="secondary"
                    :disabled="props.isLoading"
                    @click="handleClose"
                >
                    {{ props.cancelText }}
                </BricksButton>

                <BricksButton
                    size="sm"
                    :variant="props.confirmVariant"
                    :disabled="props.isLoading"
                    @click="handleConfirm"
                >
                    {{ props.confirmText }}
                </BricksButton>
            </div>
        </div>
    </BricksModal>
</template>

<style module lang="scss">
.modal {
    overflow: hidden;
    display: flex;
    width: 100%;
    max-width: 52rem;
    border-radius: var(--border-radius-md);
    background: var(--bricks-base-0);
    box-shadow: var(--shadow-xl);
    flex-direction: column;
}

.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.6rem 2rem;
    border-bottom: 1px solid var(--bricks-base-200);
}

.title {
    margin: 0;
    font-size: 1.6rem;
    font-weight: 600;
    color: var(--bricks-base-900);
}

.content {
    padding: 1.6rem 2rem;
}

.description {
    margin: 0;
    font-size: 1.4rem;
    line-height: 1.5;
    color: var(--bricks-base-700);
}

.actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.8rem;
    padding: 1.6rem 2rem;
    border-top: 1px solid var(--bricks-base-200);
}
</style>
