<script setup lang="ts">
// #region Imports
// Types
import type {
    IBuilderDraftRestoreModalEmits,
    IBuilderDraftRestoreModalProps,
} from '../types/builder';

// Utils
import { formatPageDateTime } from '../../publish/utils/dates';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksCloseButton from '../../../ui/base/modal/BricksCloseButton.vue';
import BricksModal from '../../../ui/base/modal/BricksModal.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBuilderDraftRestoreModalProps>(), {
    updatedAt: null,
});
// #endregion

// #region Emits
const emit = defineEmits<IBuilderDraftRestoreModalEmits>();
// #endregion

// #region Data
const { t } = useI18n();
// #endregion

// #region Computed
/**
 * Описание с датой черновика: выбирать между двумя состояниями страницы, не зная
 * возраста второго, — угадывание. Без даты (битая запись) остаётся общий текст.
 */
const description = computed<string>(() => {
    if (!props.updatedAt) {
        return t('bricks.publish.draft.restoreDescription');
    }

    return t('bricks.publish.draft.restoreDescriptionDated', {
        date: formatPageDateTime(props.updatedAt),
    });
});
// #endregion

// #region Methods
/**
 * Закрывает окно, не отвечая: черновик остаётся, предложение — тоже.
 */
function handleClose(): void {
    emit('close');
}

/**
 * Применяет черновик поверх открытой сохранённой версии.
 */
function handleRestore(): void {
    emit('restore');
}

/**
 * Удаляет черновик — единственное необратимое действие этого окна.
 */
function handleDiscard(): void {
    emit('discard');
}
// #endregion
</script>

<template>
    <BricksModal
        :is-open="props.isOpen"
        :title="t('bricks.publish.draft.restoreTitle')"
        variant="gradient"
        padded
        :duration="200"
        @close="handleClose"
    >
        <div :class="$style.TheBuilderDraftRestoreModal">
            <div :class="$style.header">
                <h3 :class="$style.title">{{ t('bricks.publish.draft.restoreTitle') }}</h3>
                <BricksCloseButton @click="handleClose" />
            </div>

            <div :class="$style.content">
                <p :class="$style.description">{{ description }}</p>
            </div>

            <div :class="$style.actions">
                <BricksButton size="sm" variant="ghost" @click="handleDiscard">
                    {{ t('bricks.publish.draft.restoreDiscard') }}
                </BricksButton>

                <BricksButton size="sm" variant="primary" @click="handleRestore">
                    {{ t('bricks.publish.draft.restoreConfirm') }}
                </BricksButton>
            </div>
        </div>
    </BricksModal>
</template>

<style module lang="scss">
.TheBuilderDraftRestoreModal {
    overflow: hidden;
    display: flex;
    width: 100%;
    max-width: 52rem;
    border-radius: var(--bricks-border-radius-md);
    background: var(--bricks-base-0);
    box-shadow: var(--bricks-shadow-xl);
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

/*
 * Удаление стоит слева и отдельно от восстановления: обе кнопки в правом углу
 * стоят рядом, и промах по необратимой стал бы вопросом пары пикселей.
 */
.actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    padding: 1.6rem 2rem;
    border-top: 1px solid var(--bricks-base-200);
}
</style>
