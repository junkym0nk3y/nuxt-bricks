<script setup lang="ts">
/**
 * @description Модалка «Сохранить как шаблон»: карточка источника, имя, описание
 * и объяснение состава шаблона.
 *
 * Одна на обе точки входа — строку списка страниц и сплит-кнопку билдера, —
 * потому что различаются они только источником содержимого, а он приходит
 * пропом. Подпись под полями это различие проговаривает прямо: из билдера в
 * шаблон уедет то, что сейчас на канвасе, вместе с несохранёнными правками, а
 * миниатюра — кадр последнего сохранения; без этой строки «Сохранить как шаблон»
 * из билдера тихо унесло бы в шаблон черновик.
 */

// #region Imports
// Types
import type { ITemplatesSaveModalProps, ITemplatesSaveModalEmits } from '../types/templates';

// Utils
import { formatPageDate } from '../../../common/utils/bricks/dates';

// Vue
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Constants
import {
    TEMPLATE_DESCRIPTION_MAX_LENGTH,
    TEMPLATE_NAME_MAX_LENGTH,
} from '../../../common/constants/templates';

// Composables
import { useTemplateSaveForm } from '../composables/useTemplateSaveForm';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksFieldError from '../../../ui/inputs/BricksFieldError.vue';
import BricksFieldHint from '../../../ui/inputs/BricksFieldHint.vue';
import BricksInput from '../../../ui/inputs/BricksInput.vue';
import BricksModal from '../../../ui/base/modal/BricksModal.vue';
import BricksModalFooter from '../../../ui/base/modal/BricksModalFooter.vue';
import BricksModalHeader from '../../../ui/base/modal/BricksModalHeader.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<ITemplatesSaveModalProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<ITemplatesSaveModalEmits>();
// #endregion

// #region Data
const { t } = useI18n();

const { name, description, errors, generalError, isSubmitting, submitForm, resetForm } =
    useTemplateSaveForm({
        source: computed(() => props.source),
        onSaved: (template) => emit('saved', template),
    });
// #endregion

// #region Computed
/**
 * Мета-строка карточки источника: адрес, объём и дата последнего сохранения.
 * У несохранённой страницы даты нет — вместо неё говорится, что в шаблон уедет
 * текущее состояние канваса.
 */
const sourceMeta = computed<string>(() => {
    const source = props.source;

    if (!source) {
        return '';
    }

    return [
        source.pageAddressPath,
        t('bricks.templates.card.blocks', { count: source.blocksCount }),
        source.pageUpdatedAt
            ? t('bricks.templates.saveModal.pageUpdated', {
                  date: formatPageDate(source.pageUpdatedAt),
              })
            : t('bricks.templates.saveModal.pageUnsaved'),
    ]
        .filter(Boolean)
        .join(' · ');
});
// #endregion

// #region Methods
/**
 * Закрывает модалку. Во время отправки не закрывается: запрос уже в пути, и
 * закрытая форма оставила бы человека без исхода.
 */
function handleClose(): void {
    if (isSubmitting.value) {
        return;
    }

    emit('close');
}
// #endregion

// #region Lifecycle
// Форма наполняется на КАЖДОМ открытии, а не при закрытии: сброс на закрытии
// стёр бы поля прямо под уезжающей модалкой (её держит `force-mount` до конца
// анимации).
//
// `immediate` обязателен: в билдере модалка подключена лениво и монтируется тем же
// действием, которое её открывает, — то есть `isOpen` уже `true` к моменту
// создания компонента, и watch без немедленного вызова не срабатывал бы вовсе.
// Проверено вживую: первое открытие из сплит-кнопки давало пустые поля вместо
// названия страницы, а второе — уже заполненные.
watch(
    () => props.isOpen,
    (isOpen) => {
        if (isOpen) {
            resetForm();
        }
    },
    { immediate: true }
);
// #endregion
</script>

<template>
    <BricksModal
        :is-open="props.isOpen"
        :title="t('bricks.templates.saveModal.title')"
        variant="gradient"
        padded
        @close="handleClose"
    >
        <div :class="$style.TheBuilderTemplatesSaveModal">
            <BricksModalHeader :close-disabled="isSubmitting" @close="handleClose" />

            <form :class="$style.form" novalidate @submit.prevent="submitForm">
                <div v-if="props.source" :class="$style.source">
                    <div :class="$style.sourceThumbnail">
                        <img
                            v-if="props.source.thumbnailSourceUrl"
                            :class="$style.sourceThumbnailImage"
                            :src="props.source.thumbnailSourceUrl"
                            :alt="props.source.pageLabel"
                        />
                        <BricksIcon
                            v-else
                            icon="ta:outline-photo"
                            :class="$style.sourceThumbnailPlaceholder"
                        />
                    </div>
                    <div :class="$style.sourceText">
                        <span :class="$style.sourceLabel">{{ props.source.pageLabel }}</span>
                        <span :class="$style.sourceMeta">{{ sourceMeta }}</span>
                    </div>
                </div>

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

                <BricksFieldHint>{{ t('bricks.templates.saveModal.contentHint') }}</BricksFieldHint>

                <BricksFieldError :message="generalError" />

                <BricksModalFooter variant="inline">
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
                        :disabled="isSubmitting || props.source === null"
                    >
                        {{ t('bricks.templates.saveModal.submit') }}
                    </BricksButton>
                </BricksModalFooter>
            </form>
        </div>
    </BricksModal>
</template>

<style module lang="scss">
.TheBuilderTemplatesSaveModal {
    overflow: hidden;
    display: flex;
    width: 100%;
    max-width: 48rem;
    border-radius: var(--bricks-border-radius-md);
    background: var(--bricks-base-0);
    box-shadow: var(--bricks-shadow-lg);
    flex-direction: column;
}

.form {
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
    padding: 2rem;
}

.source {
    display: flex;
    align-items: center;
    gap: 1.2rem;
    padding: 1rem 1.2rem;
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-surface-raised);
}

.sourceThumbnail {
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 7.2rem;
    height: 4.6rem;
    border-radius: var(--bricks-border-radius-xs);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-100);
}

.sourceThumbnailImage {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top;
}

.sourceThumbnailPlaceholder {
    font-size: 1.8rem;
    color: var(--bricks-base-400);
}

.sourceText {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    min-width: 0;
}

.sourceLabel {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.4rem;
    font-weight: 600;
    color: var(--bricks-base-900);
}

.sourceMeta {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.2rem;
    color: var(--bricks-base-400);
}

.field {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
}
</style>
