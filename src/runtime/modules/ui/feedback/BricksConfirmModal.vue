<script setup lang="ts">
// #region Imports
// Types
import type { IBricksConfirmModalEmits, IBricksConfirmModalProps } from './types';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BricksButton from '../base/button/BricksButton.vue';
import BricksModal from '../base/modal/BricksModal.vue';
import BricksModalFooter from '../base/modal/BricksModalFooter.vue';
import BricksModalHeader from '../base/modal/BricksModalHeader.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksConfirmModalProps>(), {
    description: '',
    confirmText: '',
    cancelText: '',
    confirmVariant: 'primary',
    isLoading: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IBricksConfirmModalEmits>();
// #endregion

// #region Data
const { t } = useI18n();
// #endregion

// #region Computed
const normalizedDescription = computed(() => props.description?.trim());
const confirmLabel = computed(() => props.confirmText || t('bricks.common.confirm'));
const cancelLabel = computed(() => props.cancelText || t('bricks.common.cancel'));
// #endregion

// #region Methods
/**
 * Closes the confirmation modal.
 */
function handleClose(): void {
    if (props.isLoading) {
        return;
    }
    emit('close');
}

/**
 * Confirms the action.
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
        layer="confirm"
        :duration="200"
        @close="handleClose"
        @after-leave="emit('afterLeave')"
    >
        <div :class="$style.BricksConfirmModal">
            <BricksModalHeader :close-disabled="props.isLoading" @close="handleClose" />

            <div v-if="normalizedDescription" :class="$style.content">
                <p :class="$style.description">{{ normalizedDescription }}</p>
            </div>

            <BricksModalFooter>
                <BricksButton
                    size="sm"
                    variant="secondary"
                    :disabled="props.isLoading"
                    @click="handleClose"
                >
                    {{ cancelLabel }}
                </BricksButton>

                <BricksButton
                    size="sm"
                    :variant="props.confirmVariant"
                    :disabled="props.isLoading"
                    @click="handleConfirm"
                >
                    {{ confirmLabel }}
                </BricksButton>
            </BricksModalFooter>
        </div>
    </BricksModal>
</template>

<style module lang="scss">
.BricksConfirmModal {
    overflow: hidden;
    display: flex;
    width: 100%;
    max-width: 52rem;
    border-radius: var(--bricks-border-radius-md);
    background: var(--bricks-base-0);
    box-shadow: var(--bricks-shadow-xl);
    flex-direction: column;
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
</style>
