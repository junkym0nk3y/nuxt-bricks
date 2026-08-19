<script setup lang="ts">
/**
 * @description Модалка правки подписи шаблона: имя и описание.
 *
 * Правится только подпись: содержимое шаблона — отпечаток момента, и «обновить
 * его текущей страницей» означало бы связь с источником, версии шаблона и
 * разрешение конфликтов. А вот опечатку в имени иначе было бы не исправить ничем,
 * кроме удаления и повторного сохранения.
 */

// #region Imports
// Types
import type { ITemplatesRenameModalProps, ITemplatesRenameModalEmits } from '../types/templates';

// Vue
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Constants
import {
    TEMPLATE_DESCRIPTION_MAX_LENGTH,
    TEMPLATE_NAME_MAX_LENGTH,
} from '../../../common/constants/templates';

// Composables
import { useTemplateRenameForm } from '../composables/useTemplateRenameForm';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksCloseButton from '../../../ui/base/modal/BricksCloseButton.vue';
import BricksFieldError from '../../../ui/inputs/BricksFieldError.vue';
import BricksInput from '../../../ui/inputs/BricksInput.vue';
import BricksModal from '../../../ui/base/modal/BricksModal.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<ITemplatesRenameModalProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<ITemplatesRenameModalEmits>();
// #endregion

// #region Data
const { t } = useI18n();

const { name, description, errors, generalError, isSubmitting, submitForm, resetForm } =
    useTemplateRenameForm({
        template: computed(() => props.template),
        onSaved: (template) => emit('saved', template),
    });
// #endregion

// #region Methods
/**
 * Закрывает модалку; во время отправки закрытие заблокировано.
 */
function handleClose(): void {
    if (isSubmitting.value) {
        return;
    }

    emit('close');
}
// #endregion

// #region Lifecycle
watch(
    () => props.isOpen,
    (isOpen) => {
        if (isOpen) {
            resetForm();
        }
    }
);
// #endregion
</script>

<template>
    <BricksModal
        :is-open="props.isOpen"
        :title="t('bricks.templates.renameModal.title')"
        variant="gradient"
        padded
        @close="handleClose"
    >
        <div :class="$style.TheBuilderTemplatesRenameModal">
            <div :class="$style.header">
                <h3 :class="$style.title">{{ t('bricks.templates.renameModal.title') }}</h3>
                <BricksCloseButton :disabled="isSubmitting" @click="handleClose" />
            </div>

            <form :class="$style.form" novalidate @submit.prevent="submitForm">
                <div :class="$style.field">
                    <BricksInput
                        :label="t('bricks.templates.saveModal.nameLabel')"
                        :value="name"
                        :max-length="TEMPLATE_NAME_MAX_LENGTH"
                        :disabled="isSubmitting"
                        :error-message="errors.name"
                        autocomplete="off"
                        @update:value="(value: string) => (name = value)"
                    />
                </div>

                <div :class="$style.field">
                    <BricksInput
                        :label="t('bricks.templates.saveModal.descriptionLabel')"
                        :value="description"
                        :max-length="TEMPLATE_DESCRIPTION_MAX_LENGTH"
                        :placeholder="t('bricks.templates.saveModal.descriptionPlaceholder')"
                        :disabled="isSubmitting"
                        :error-message="errors.description"
                        autocomplete="off"
                        @update:value="(value: string) => (description = value)"
                    />
                </div>

                <BricksFieldError :message="generalError" />

                <div :class="$style.footer">
                    <BricksButton
                        size="md"
                        variant="ghost"
                        type="button"
                        :disabled="isSubmitting"
                        @click="handleClose"
                    >
                        {{ t('bricks.common.cancel') }}
                    </BricksButton>
                    <BricksButton
                        size="md"
                        variant="primary"
                        type="submit"
                        :disabled="isSubmitting || props.template === null"
                    >
                        {{ t('bricks.common.save') }}
                    </BricksButton>
                </div>
            </form>
        </div>
    </BricksModal>
</template>

<style module lang="scss">
.TheBuilderTemplatesRenameModal {
    overflow: hidden;
    display: flex;
    width: 100%;
    max-width: 44rem;
    border-radius: var(--bricks-border-radius-md);
    background: var(--bricks-base-0);
    box-shadow: var(--bricks-shadow-lg);
    flex-direction: column;
}

.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    padding: 1.8rem 2rem 1.8rem 2.4rem;
    border-bottom: 1px solid var(--bricks-base-200);
}

.title {
    margin: 0;
    font-size: 1.6rem;
    font-weight: 600;
    color: var(--bricks-base-900);
}

.form {
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
    padding: 2rem 2.4rem;
}

.field {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
}

.footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.8rem;
    padding-top: 0.4rem;
}
</style>
