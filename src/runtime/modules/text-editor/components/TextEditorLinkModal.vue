<script setup lang="ts">
/**
 * @description Link form for a selection inside the TipTap editor.
 *
 * Every editor surface mounts its own copy (the properties panel, the expanded modal,
 * the inline overlay on the canvas) instead of one instance per application: each
 * surface has an editor instance of its own, and a shared modal would apply the link to
 * the one that has already been destroyed by the time the author confirms.
 */

// #region Imports
// Types
import type { ITextEditorLinkModalProps, ITextEditorLinkModalEmits } from '../types/components';

// Utils
import { normalizeLinkHref } from '../utils/linkHref';

// Vue
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BricksButton from '../../ui/base/button/BricksButton.vue';
import BricksCheckbox from '../../ui/base/checkbox/BricksCheckbox.vue';
import BricksFieldHint from '../../ui/inputs/BricksFieldHint.vue';
import BricksInput from '../../ui/inputs/BricksInput.vue';
import BricksModal from '../../ui/base/modal/BricksModal.vue';
import BricksModalFooter from '../../ui/base/modal/BricksModalFooter.vue';
import BricksModalHeader from '../../ui/base/modal/BricksModalHeader.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<ITextEditorLinkModalProps>(), {
    canRemove: false,
    layer: 'modal',
});
// #endregion

// #region Emits
const emit = defineEmits<ITextEditorLinkModalEmits>();
// #endregion

// #region Data
/** Ceiling on the address length: the field default (120) cuts an ordinary URL with a query */
const HREF_MAX_LENGTH = 2048;

const { t } = useI18n();

const href = ref<string>('');
const openInNewTab = ref<boolean>(false);

/** The error shows after an attempt to apply, not on every typed character */
const isValidationVisible = ref<boolean>(false);
// #endregion

// #region Computed
/** Normalized address; null means the link policy does not let it through */
const normalizedHref = computed<string | null>(() => normalizeLinkHref(href.value));

const errorMessage = computed<string | null>(() =>
    isValidationVisible.value && !normalizedHref.value
        ? t('bricks.textEditor.linkModal.invalidUrl')
        : null
);
// #endregion

// #region Methods
/**
 * Applies the link. An empty or forbidden address shows the error and leaves the form
 * open: closing silently would read as "the link has been set".
 */
function handleApply(): void {
    if (!normalizedHref.value) {
        isValidationVisible.value = true;
        return;
    }

    emit('apply', { href: href.value, openInNewTab: openInNewTab.value });
}

/** Removes the link from the selection */
function handleRemove(): void {
    emit('remove');
}

/** Closes the form with no changes */
function handleClose(): void {
    emit('close');
}
// #endregion

// #region Lifecycle
// The form is refilled on every opening: an address left over from the previous link
// would be applied to the next selection with a single press of the button
watch(
    () => [props.isOpen, props.value] as const,
    ([isOpen, value]) => {
        if (!isOpen) {
            return;
        }

        href.value = value.href;
        openInNewTab.value = value.openInNewTab;
        isValidationVisible.value = false;
    },
    { immediate: true }
);
// #endregion
</script>

<template>
    <BricksModal
        :is-open="props.isOpen"
        :title="t('bricks.textEditor.linkModal.title')"
        :layer="props.layer"
        variant="gradient"
        padded
        @close="handleClose"
    >
        <div :class="$style.TextEditorLinkModal">
            <BricksModalHeader @close="handleClose" />

            <form :class="$style.form" novalidate @submit.prevent="handleApply">
                <BricksInput
                    :label="t('bricks.textEditor.linkModal.url')"
                    :value="href"
                    :placeholder="t('bricks.textEditor.linkModal.urlPlaceholder')"
                    :error-message="errorMessage"
                    :max-length="HREF_MAX_LENGTH"
                    autocomplete="off"
                    @update:value="(value: string) => (href = value)"
                />

                <BricksCheckbox
                    :value="openInNewTab"
                    :label="t('bricks.textEditor.linkModal.newTab')"
                    name="bricks-link-new-tab"
                    @update:value="(value: boolean) => (openInNewTab = value)"
                />

                <BricksFieldHint>{{ t('bricks.textEditor.linkModal.hint') }}</BricksFieldHint>

                <BricksModalFooter variant="inline">
                    <BricksButton
                        v-if="props.canRemove"
                        size="md"
                        variant="ghost"
                        type="button"
                        @click="handleRemove"
                    >
                        {{ t('bricks.textEditor.linkModal.remove') }}
                    </BricksButton>

                    <BricksButton size="md" variant="primary" type="submit">
                        {{ t('bricks.textEditor.linkModal.apply') }}
                    </BricksButton>
                </BricksModalFooter>
            </form>
        </div>
    </BricksModal>
</template>

<style module lang="scss">
.TextEditorLinkModal {
    display: flex;
    flex-direction: column;
    width: 44rem;
    max-width: 100%;
    max-height: 100%;
    border-radius: var(--bricks-border-radius-md);
    background: var(--bricks-base-0);
    box-shadow: var(--bricks-shadow-lg);
}

.form {
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    padding: 2rem;
    gap: 1.6rem;
}
</style>
