<script setup lang="ts">
// #region Imports
// Types
import type {
    IPublishCreatePageModalProps,
    IPublishCreatePageModalEmits,
} from '../types/dashboard';

// Vue
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { usePublishCreatePageForm } from '../composables/usePublishCreatePageForm';

// Components
import BricksInput from '../../../ui/inputs/BricksInput.vue';
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksCloseButton from '../../../ui/base/modal/BricksCloseButton.vue';
import BricksModal from '../../../ui/base/modal/BricksModal.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IPublishCreatePageModalProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IPublishCreatePageModalEmits>();
// #endregion

// #region Data
const { t } = useI18n();

const {
    title,
    pagename,
    description,
    keywords,
    urlPrefix,
    subdomain,
    errors,
    slugPreview,
    isSubmitting,
    generalError,
    setPagename,
    submitForm,
    resetToEmpty,
} = usePublishCreatePageForm({
    onCreated: (createdPagename) => emit('created', createdPagename),
});

const isAdvancedOpen = ref(false);
const host = ref('');
const titleFieldRef = ref<HTMLDivElement | null>(null);
// #endregion

// #region Computed
/**
 * Live-подсказка URL будущей страницы от текущих значений формы.
 */
const urlHint = computed<string>(() => {
    if (!slugPreview.value) {
        return '';
    }
    const prefix = String(urlPrefix.value ?? '').trim();
    const sub = String(subdomain.value ?? '').trim();
    const path = prefix ? `/${prefix}/${slugPreview.value}` : `/${slugPreview.value}`;
    const domain = host.value || t('bricks.publish.domainStub');
    const url = sub ? `${sub}.${domain}${path}` : `${domain}${path}`;
    return t('bricks.publish.dashboard.createModal.urlHint', { url });
});
// #endregion

// #region Methods
/**
 * Закрывает модалку (форма сбрасывается при следующем открытии).
 */
function handleClose(): void {
    if (isSubmitting.value) {
        return;
    }
    emit('close');
}

/**
 * Разворачивает/сворачивает секцию дополнительных полей.
 */
function handleToggleAdvanced(): void {
    isAdvancedOpen.value = !isAdvancedOpen.value;
}
// #endregion

// #region Lifecycle
watch(
    () => props.isOpen,
    async (isOpen) => {
        if (!isOpen) {
            return;
        }
        resetToEmpty();
        isAdvancedOpen.value = false;
        await nextTick();
        titleFieldRef.value?.querySelector('input')?.focus();
    }
);

onMounted(() => {
    host.value = window.location.host;
});
// #endregion
</script>

<template>
    <BricksModal
        :is-open="props.isOpen"
        :title="t('bricks.publish.dashboard.createModal.title')"
        variant="gradient"
        padded
        @close="handleClose"
    >
        <div :class="$style.TheBuilderPublishCreatePageModal">
            <div :class="$style.header">
                <h3 :class="$style.title">
                    {{ t('bricks.publish.dashboard.createModal.title') }}
                </h3>
                <BricksCloseButton :disabled="isSubmitting" @click="handleClose" />
            </div>

            <div :class="$style.body">
                <div ref="titleFieldRef" :class="$style.field">
                    <BricksInput
                        :label="t('bricks.publish.dashboard.createModal.titleLabel')"
                        :value="title"
                        type="text"
                        :max-length="120"
                        :placeholder="t('bricks.publish.titlePlaceholder')"
                        :disabled="isSubmitting"
                        @update:value="(val: string) => (title = val)"
                    />
                    <span v-if="errors.title" :class="$style.fieldError">{{ errors.title }}</span>
                </div>

                <div :class="$style.field">
                    <BricksInput
                        :label="t('bricks.publish.dashboard.details.pagenameLabel')"
                        :value="pagename"
                        type="slug"
                        :max-length="80"
                        placeholder="my-page"
                        :disabled="isSubmitting"
                        @update:value="setPagename"
                    />
                    <span v-if="errors.pagename" :class="$style.fieldError">
                        {{ errors.pagename }}
                    </span>
                    <span v-if="urlHint" :class="$style.fieldHint">{{ urlHint }}</span>
                </div>

                <div :class="$style.field">
                    <BricksInput
                        :label="t('bricks.publish.dashboard.details.descriptionLabel')"
                        :value="description"
                        type="text"
                        :max-length="500"
                        :placeholder="
                            t('bricks.publish.dashboard.createModal.descriptionPlaceholder')
                        "
                        :disabled="isSubmitting"
                        @update:value="(val: string) => (description = val)"
                    />
                    <span v-if="errors.description" :class="$style.fieldError">
                        {{ errors.description }}
                    </span>
                </div>

                <div :class="$style.field">
                    <span :class="$style.fieldLabel">
                        {{ t('bricks.publish.dashboard.createModal.startWith') }}
                    </span>
                    <div :class="$style.startCards">
                        <div :class="[$style.startCard, $style.startCardActive]">
                            <BricksIcon icon="cl:note-edit" :class="$style.startCardIcon" />
                            <span :class="$style.startCardTitle">
                                {{ t('bricks.publish.dashboard.createModal.blankTitle') }}
                            </span>
                            <span :class="$style.startCardDescription">
                                {{ t('bricks.publish.dashboard.createModal.blankDescription') }}
                            </span>
                        </div>
                        <div :class="[$style.startCard, $style.startCardDisabled]">
                            <BricksIcon icon="ph:package" :class="$style.startCardIcon" />
                            <span :class="$style.startCardTitle">
                                {{ t('bricks.publish.dashboard.createModal.templateTitle') }}
                            </span>
                            <span :class="$style.startCardDescription">
                                {{ t('bricks.publish.dashboard.createModal.templateDescription') }}
                            </span>
                        </div>
                    </div>
                </div>

                <div :class="$style.advanced">
                    <button
                        :class="$style.advancedToggle"
                        type="button"
                        @click="handleToggleAdvanced"
                    >
                        <BricksIcon
                            icon="ph:caret-right"
                            :class="[
                                $style.advancedCaret,
                                isAdvancedOpen && $style.advancedCaretOpen,
                            ]"
                        />
                        {{ t('bricks.publish.dashboard.createModal.advanced') }}
                    </button>

                    <div v-if="isAdvancedOpen" :class="$style.advancedFields">
                        <div :class="$style.field">
                            <BricksInput
                                label="URL Prefix"
                                :value="urlPrefix"
                                type="text"
                                :max-length="100"
                                placeholder="blog"
                                :disabled="isSubmitting"
                                @update:value="(val: string) => (urlPrefix = val)"
                            />
                            <span v-if="errors.urlPrefix" :class="$style.fieldError">
                                {{ errors.urlPrefix }}
                            </span>
                            <span :class="$style.fieldHint">
                                {{ t('bricks.publish.urlPrefixHint') }}
                            </span>
                        </div>
                        <div :class="$style.field">
                            <BricksInput
                                :label="t('bricks.publish.subdomain')"
                                :value="subdomain"
                                type="text"
                                :max-length="63"
                                placeholder="spb"
                                :disabled="isSubmitting"
                                @update:value="(val: string) => (subdomain = val)"
                            />
                            <span v-if="errors.subdomain" :class="$style.fieldError">
                                {{ errors.subdomain }}
                            </span>
                            <span :class="$style.fieldHint">
                                {{ t('bricks.publish.subdomainHint') }}
                            </span>
                        </div>
                        <div :class="$style.field">
                            <BricksInput
                                :label="t('bricks.publish.dashboard.details.keywordsLabel')"
                                :value="keywords"
                                type="text"
                                :max-length="255"
                                placeholder="promo, page, marketing"
                                :disabled="isSubmitting"
                                @update:value="(val: string) => (keywords = val)"
                            />
                            <span v-if="errors.keywords" :class="$style.fieldError">
                                {{ errors.keywords }}
                            </span>
                        </div>
                    </div>
                </div>

                <span v-if="generalError" :class="$style.fieldError">{{ generalError }}</span>
            </div>

            <div :class="$style.footer">
                <BricksButton
                    size="md"
                    variant="ghost"
                    :disabled="isSubmitting"
                    @click="handleClose"
                >
                    {{ t('bricks.common.cancel') }}
                </BricksButton>
                <BricksButton
                    size="md"
                    variant="primary"
                    :disabled="isSubmitting"
                    @click="submitForm"
                >
                    {{ t('bricks.publish.dashboard.createModal.submit') }}
                </BricksButton>
            </div>
        </div>
    </BricksModal>
</template>

<style module lang="scss">
.TheBuilderPublishCreatePageModal {
    overflow: hidden;
    display: flex;
    width: 100%;
    max-width: 56rem;
    border-radius: var(--border-radius-md);
    background: var(--bricks-base-0);
    box-shadow: var(--shadow-lg);
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

.body {
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
    padding: 2rem 2.4rem 0.8rem;
}

.field {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
}

.fieldLabel {
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--bricks-base-600);
}

.fieldError {
    font-size: 1.2rem;
    color: var(--bricks-danger-500);
}

.fieldHint {
    font-size: 1.2rem;
    color: var(--bricks-base-400);
}

.startCards {
    display: flex;
    gap: 1.2rem;
}

.startCard {
    display: flex;
    flex: 1;
    min-width: 0;
    padding: 1.4rem 1.4rem 1.2rem;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--bricks-base-300);
    background: var(--bricks-base-0);
    flex-direction: column;
    gap: 0.6rem;
}

.startCardActive {
    border-color: var(--bricks-primary-500);
    background: var(--bricks-primary-50);

    .startCardTitle {
        color: var(--bricks-primary-600);
    }

    .startCardIcon {
        color: var(--bricks-primary-600);
    }
}

.startCardDisabled {
    opacity: 0.55;
}

.startCardIcon {
    width: 2rem;
    height: 2rem;
    color: var(--bricks-base-600);
}

.startCardTitle {
    font-size: 1.4rem;
    font-weight: 600;
    color: var(--bricks-base-900);
}

.startCardDescription {
    font-size: 1.2rem;
    color: var(--bricks-base-500);
}

.advanced {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
}

.advancedToggle {
    display: flex;
    align-items: center;
    align-self: flex-start;
    padding: 0;
    border: none;
    background: transparent;
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--bricks-base-600);
    transition: color var(--default-transition);
    cursor: pointer;
    gap: 0.6rem;

    &:hover {
        color: var(--bricks-base-900);
    }
}

.advancedCaret {
    width: 1.2rem;
    height: 1.2rem;
    transition: transform var(--default-transition);
}

.advancedCaretOpen {
    transform: rotate(90deg);
}

.advancedFields {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
}

.footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.8rem;
    padding: 1.6rem 2.4rem 2rem;
}
</style>
