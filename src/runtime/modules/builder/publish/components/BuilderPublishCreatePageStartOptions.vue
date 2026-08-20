<script setup lang="ts">
// #region Imports
// Types
import type {
    IPublishCreatePageStartOptionsProps,
    IPublishCreatePageStartOptionsEmits,
} from '../types/dashboard';

// Vue
import { useI18n } from 'vue-i18n';

// Components
import BricksFieldError from '../../../ui/inputs/BricksFieldError.vue';
import BricksIconButton from '../../../ui/base/icon-button/BricksIconButton.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IPublishCreatePageStartOptionsProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IPublishCreatePageStartOptionsEmits>();
// #endregion

// #region Data
const { t } = useI18n();
// #endregion

// #region Methods
/**
 * Выбирает пустую страницу как источник содержимого.
 */
function handleSelectBlank(): void {
    if (props.isSubmitting) {
        return;
    }

    emit('select-blank');
}

/**
 * Открывает выбор JSON-файла. Клик по карточке сразу ведёт к диалогу: вариант
 * «из файла» без файла ничего не значит.
 */
function handlePickFile(): void {
    if (props.isSubmitting) {
        return;
    }

    emit('pick-file');
}

/**
 * Снимает выбранный файл — источник возвращается к пустой странице.
 */
function handleClearFile(): void {
    if (props.isSubmitting) {
        return;
    }

    emit('clear-file');
}

/**
 * Открывает выбор шаблона. Клик по карточке сразу ведёт к списку: вариант «из
 * шаблона» без шаблона ничего не значит — та же логика, что у выбора файла.
 */
function handlePickTemplate(): void {
    if (props.isSubmitting) {
        return;
    }

    emit('pick-template');
}

/**
 * Снимает выбранный шаблон — источник возвращается к пустой странице.
 */
function handleClearTemplate(): void {
    if (props.isSubmitting) {
        return;
    }

    emit('clear-template');
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderPublishCreatePageStartOptions">
        <span :class="$style.label">
            {{ t('bricks.publish.dashboard.createModal.startWith') }}
        </span>

        <div :class="$style.cards">
            <button
                :class="[$style.card, props.source === 'blank' && $style.cardActive]"
                type="button"
                :aria-pressed="props.source === 'blank'"
                @click="handleSelectBlank"
            >
                <BricksIcon icon="ta:outline-file-pencil" :class="$style.cardIcon" />
                <span :class="$style.cardTitle">
                    {{ t('bricks.publish.dashboard.createModal.blankTitle') }}
                </span>
                <span :class="$style.cardDescription">
                    {{ t('bricks.publish.dashboard.createModal.blankDescription') }}
                </span>
            </button>

            <button
                :class="[$style.card, props.source === 'template' && $style.cardActive]"
                type="button"
                :aria-pressed="props.source === 'template'"
                @click="handlePickTemplate"
            >
                <BricksIcon icon="ta:outline-package" :class="$style.cardIcon" />
                <span :class="$style.cardTitle">
                    {{ t('bricks.publish.dashboard.createModal.templateTitle') }}
                </span>
                <span :class="$style.cardDescription">
                    {{ t('bricks.publish.dashboard.createModal.templateDescription') }}
                </span>
            </button>

            <button
                :class="[$style.card, props.source === 'file' && $style.cardActive]"
                type="button"
                :aria-pressed="props.source === 'file'"
                @click="handlePickFile"
            >
                <BricksIcon icon="ta:outline-cloud-upload" :class="$style.cardIcon" />
                <span :class="$style.cardTitle">
                    {{ t('bricks.publish.dashboard.createModal.fileTitle') }}
                </span>
                <span :class="$style.cardDescription">
                    {{ t('bricks.publish.dashboard.createModal.fileDescription') }}
                </span>
            </button>
        </div>

        <!--
            Выбранный шаблон — той же строкой, что и выбранный файл: оба сообщают
            «источник выбран, вот какой», и одинаковое место делает их
            взаимозаменяемость очевидной
        -->
        <div v-if="props.selectedTemplate" :class="$style.selectedFile">
            <BricksIcon icon="ta:outline-package" :class="$style.selectedFileIcon" />
            <span :class="$style.selectedFileName">{{ props.selectedTemplate.name }}</span>
            <span :class="$style.selectedFileMeta">
                {{
                    t('bricks.templates.card.blocks', {
                        count: props.selectedTemplate.blocksCount,
                    })
                }}
            </span>
            <BricksIconButton
                icon="ta:outline-x"
                :label="t('bricks.common.clear')"
                variant="ghost"
                :disabled="props.isSubmitting"
                @click="handleClearTemplate"
            />
        </div>

        <!--
            Имя файла и число блоков — строкой под карточками: в ширину карточки
            они не помещаются
        -->
        <div v-if="props.selectedFile" :class="$style.selectedFile">
            <BricksIcon icon="ta:outline-files" :class="$style.selectedFileIcon" />
            <span :class="$style.selectedFileName">{{ props.selectedFile.filename }}</span>
            <span :class="$style.selectedFileMeta">
                {{
                    t('bricks.publish.dashboard.createModal.fileBlocks', {
                        count: props.selectedFile.blocksCount,
                    })
                }}
            </span>
            <BricksIconButton
                icon="ta:outline-x"
                :label="t('bricks.common.clear')"
                variant="ghost"
                :disabled="props.isSubmitting"
                @click="handleClearFile"
            />
        </div>

        <BricksFieldError :message="props.error" />
    </div>
</template>

<style module lang="scss">
.BuilderPublishCreatePageStartOptions {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
}

.label {
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--bricks-base-600);
}

.cards {
    display: flex;

    // Три карточки в ряд: ширина контента модалки делится на них при этом gap,
    // и карточки выравниваются по высоте
    gap: 1rem;
    align-items: stretch;
}

.card {
    display: flex;
    flex: 1;
    min-width: 0;
    padding: 1.4rem 1.4rem 1.2rem;
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid var(--bricks-base-300);
    background: var(--bricks-base-0);
    flex-direction: column;
    gap: 0.6rem;
    text-align: left;
    transition:
        border-color var(--bricks-default-transition),
        background-color var(--bricks-default-transition);
    cursor: pointer;

    &:hover:not(:disabled) {
        border-color: var(--bricks-primary-500);
    }
}

.cardActive {
    border-color: var(--bricks-primary-500);
    background: var(--bricks-primary-50);

    .cardTitle {
        color: var(--bricks-primary-600);
    }

    .cardIcon {
        color: var(--bricks-primary-600);
    }
}

.cardIcon {
    width: 2rem;
    height: 2rem;
    color: var(--bricks-base-600);
}

.cardTitle {
    font-size: 1.4rem;
    font-weight: 600;
    color: var(--bricks-base-900);
}

.cardDescription {
    font-size: 1.2rem;
    color: var(--bricks-base-500);
}

.selectedFile {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    min-width: 0;
    padding: 0.8rem 1rem;
    border-radius: var(--bricks-border-radius-xs);
    background: var(--bricks-base-50);
}

.selectedFileIcon {
    flex-shrink: 0;
    width: 1.6rem;
    height: 1.6rem;
    color: var(--bricks-base-600);
}

.selectedFileName {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--bricks-base-900);
}

.selectedFileMeta {
    flex: 1;
    white-space: nowrap;
    font-size: 1.2rem;
    color: var(--bricks-base-400);
}
</style>
