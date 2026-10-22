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
 * The description carrying the date of the draft: choosing between two states of a
 * page without knowing the age of the second one is guesswork. With no date (a
 * corrupted record) the generic text is what stays.
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
 * Closes the window without answering: the draft stays and so does the offer.
 */
function handleClose(): void {
    emit('close');
}

/**
 * Applies the draft on top of the open saved version.
 */
function handleRestore(): void {
    emit('restore');
}

/**
 * Removes the draft — the only irreversible action of this window.
 *
 * It stands in the leading slot of the footer, apart from the restore: two buttons
 * in the right corner stand side by side, and a miss of the irreversible one would
 * become a matter of a couple of pixels.
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
