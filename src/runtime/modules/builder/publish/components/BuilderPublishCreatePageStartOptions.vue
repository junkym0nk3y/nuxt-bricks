<script setup lang="ts">
/**
 * @description The choice of the content source for a new page: three cards (a blank
 * canvas, a template, a JSON file) and the row of whatever is picked.
 *
 * Decisions held by the markup and the style section: the picked template gets the
 * same row as the picked file — both say "a source is picked, and here is which one",
 * and one shared place makes it obvious that they replace each other. The name of the
 * file and the number of blocks go into that row under the cards, because they do not
 * fit the width of a card. The three cards go in one row: the width of the modal
 * content divides between them with the gap taken into account, and the cards line up
 * in height.
 *
 * The description of a card takes the secondary text role rather than a step of the
 * palette: on the tinted background of the picked card `base-500` measured 4.44:1, just
 * under the 4.5 AA asks of small text.
 */

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
 * Picks a blank page as the source of the content.
 */
function handleSelectBlank(): void {
    if (props.isSubmitting) {
        return;
    }

    emit('select-blank');
}

/**
 * Opens the JSON file picker. A click on the card leads straight to the dialog: the
 * "from a file" option means nothing without a file.
 */
function handlePickFile(): void {
    if (props.isSubmitting) {
        return;
    }

    emit('pick-file');
}

/**
 * Drops the picked file — the source goes back to a blank page.
 */
function handleClearFile(): void {
    if (props.isSubmitting) {
        return;
    }

    emit('clear-file');
}

/**
 * Opens the template picker. A click on the card leads straight to the list: the
 * "from a template" option means nothing without a template — the same reasoning as
 * for picking a file.
 */
function handlePickTemplate(): void {
    if (props.isSubmitting) {
        return;
    }

    emit('pick-template');
}

/**
 * Drops the picked template — the source goes back to a blank page.
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
    color: var(--bricks-text-muted);
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
    color: var(--bricks-text-muted);
}
</style>
