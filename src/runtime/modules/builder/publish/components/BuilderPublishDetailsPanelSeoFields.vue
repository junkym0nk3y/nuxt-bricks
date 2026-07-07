<script setup lang="ts">
// #region Imports
// Types
import type {
    IPublishDetailsPanelSeoFieldsProps,
    IPublishDetailsPanelSeoFieldsEmits,
} from '../types/dashboard';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BricksInput from '../../../ui/inputs/BricksInput.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IPublishDetailsPanelSeoFieldsProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IPublishDetailsPanelSeoFieldsEmits>();
// #endregion

// #region Data
const { t } = useI18n();
// #endregion

// #region Computed
const descriptionLength = computed<number>(() => String(props.description ?? '').length);
// #endregion

// #region Methods
/**
 * Обновляет описание из textarea.
 *
 * @param event - Событие ввода.
 */
function onDescriptionInput(event: Event): void {
    emit('update:description', (event.target as HTMLTextAreaElement).value);
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderPublishDetailsPanelSeoFields">
        <span :class="$style.sectionLabel">
            {{ t('bricks.publish.dashboard.details.seoMeta') }}
        </span>

        <div :class="$style.field">
            <BricksInput
                :label="t('bricks.publish.dashboard.details.titleLabel')"
                :value="props.title"
                type="text"
                :max-length="120"
                :placeholder="t('bricks.publish.titlePlaceholder')"
                :disabled="props.isSaving"
                @update:value="(val: string) => emit('update:title', val)"
            />
            <span v-if="props.errors.title" :class="$style.fieldError">
                {{ props.errors.title }}
            </span>
        </div>

        <div :class="$style.field">
            <BricksInput
                :label="t('bricks.publish.dashboard.details.pagenameLabel')"
                :value="props.pagename"
                type="slug"
                :max-length="80"
                placeholder="my-page"
                :disabled="props.isSaving"
                @update:value="(val: string) => emit('update:pagename', val)"
            />
            <span v-if="props.errors.pagename" :class="$style.fieldError">
                {{ props.errors.pagename }}
            </span>
        </div>

        <div :class="$style.field">
            <label :class="$style.fieldLabel">
                {{ t('bricks.publish.dashboard.details.descriptionLabel') }}
                <span :class="$style.charCount">{{ descriptionLength }}/500</span>
            </label>
            <textarea
                :value="String(props.description ?? '')"
                :class="[$style.textarea, props.errors.description && $style.textareaError]"
                :disabled="props.isSaving"
                :maxlength="500"
                rows="3"
                placeholder="SEO Description"
                @input="onDescriptionInput"
            ></textarea>
            <span v-if="props.errors.description" :class="$style.fieldError">
                {{ props.errors.description }}
            </span>
        </div>

        <div :class="$style.field">
            <BricksInput
                :label="t('bricks.publish.dashboard.details.keywordsLabel')"
                :value="props.keywords"
                type="text"
                :max-length="255"
                placeholder="promo, page, marketing"
                :disabled="props.isSaving"
                @update:value="(val: string) => emit('update:keywords', val)"
            />
            <span v-if="props.errors.keywords" :class="$style.fieldError">
                {{ props.errors.keywords }}
            </span>
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderPublishDetailsPanelSeoFields {
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
}

.sectionLabel {
    text-transform: uppercase;
    font-size: 1.2rem;
    font-weight: 600;
    letter-spacing: 0.06rem;
    color: var(--bricks-base-400);
}

.field {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
}

.fieldLabel {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 1.4rem;
    font-weight: 500;
    color: var(--bricks-base-600);
}

.charCount {
    font-size: 1.2rem;
    font-weight: 400;
    color: var(--bricks-base-400);
}

.textarea {
    box-sizing: border-box;
    width: 100%;
    min-height: 8.4rem;
    padding: 0.8rem 1.2rem;
    border-radius: var(--border-radius-xs);
    border: 1px solid var(--bricks-base-300);
    background-color: var(--bricks-base-0);
    outline: none;
    font-size: 1.4rem;
    color: var(--bricks-base-900);
    transition:
        border-color var(--default-transition),
        box-shadow var(--default-transition);
    resize: vertical;

    &::placeholder {
        color: var(--bricks-base-400);
    }

    &:hover {
        border-color: var(--bricks-base-400);
    }

    &:focus {
        border-color: var(--bricks-primary);
        box-shadow: var(--shadow-focus);
    }

    &:disabled {
        background-color: var(--bricks-base-50);
        color: var(--bricks-base-400);
    }
}

.textareaError {
    border-color: var(--bricks-danger-500);
}

.fieldError {
    font-size: 1.2rem;
    color: var(--bricks-danger-500);
}
</style>
