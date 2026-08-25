<script setup lang="ts">
/**
 * @description The "Save as template" modal: the card of the source, the name, the
 * description and the explanation of what the template is made of.
 *
 * One modal for both entry points — a row of the list of pages and the split button of
 * the builder — because the only thing they differ in is the source of the contents,
 * and that arrives as a prop. The hint under the fields says that difference out loud:
 * from the builder what travels into the template is what is on the canvas right now,
 * edits that have not been saved included, while the thumbnail is the frame of the last
 * save. Without that line "Save as template" from the builder would quietly carry a
 * draft into the template.
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
 * The meta line of the card of the source: the address, the size and the date of the
 * last save. A page that has never been saved has no date — in its place the line says
 * that what travels into the template is the current state of the canvas.
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
 * Closes the modal. It does not close during a submission: the request is already on its
 * way, and a closed form would leave the person without an outcome.
 */
function handleClose(): void {
    if (isSubmitting.value) {
        return;
    }

    emit('close');
}
// #endregion

// #region Lifecycle
// The form is filled in on EVERY opening rather than on the closing: a reset on the
// closing would wipe the fields right under the modal on its way out (`force-mount`
// holds it until the animation ends).
//
// `immediate` is a must: in the builder the modal is wired in lazily and is mounted by
// the very action that opens it — that is, `isOpen` is already `true` by the time the
// component is created, and a watch without an immediate call would not fire at all.
// Checked live: the first opening from the split button gave empty fields instead of the
// title of the page, while the second one gave filled ones.
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
    color: var(--bricks-text-muted);
}

.field {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
}
</style>
