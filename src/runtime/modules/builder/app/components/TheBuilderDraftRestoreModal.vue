<script setup lang="ts">
// #region Imports
// Types
import type {
    IBuilderDraftRestoreModalEmits,
    IBuilderDraftRestoreModalProps,
} from '../types/builder';

// Utils
import { formatPageDateTime } from '../../../common/utils/bricks/dates';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksModal from '../../../ui/base/modal/BricksModal.vue';
import BricksModalFooter from '../../../ui/base/modal/BricksModalFooter.vue';
import BricksModalHeader from '../../../ui/base/modal/BricksModalHeader.vue';
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
            <BricksModalHeader @close="handleClose" />

            <div :class="$style.content">
                <p :class="$style.description">{{ description }}</p>
            </div>

            <!--
                Отказ от черновика стоит слева и отдельно от восстановления: обе
                кнопки в правом углу стоят рядом, и промах по необратимой стал бы
                вопросом пары пикселей.
            -->
            <BricksModalFooter>
                <template #leading>
                    <BricksButton size="sm" variant="ghost" @click="handleDiscard">
                        {{ t('bricks.publish.draft.restoreDiscard') }}
                    </BricksButton>
                </template>

                <BricksButton size="sm" variant="primary" @click="handleRestore">
                    {{ t('bricks.publish.draft.restoreConfirm') }}
                </BricksButton>
            </BricksModalFooter>
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
