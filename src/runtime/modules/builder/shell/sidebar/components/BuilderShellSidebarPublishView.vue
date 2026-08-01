<script setup lang="ts">
// #region Imports
// Vue
import { useI18n } from 'vue-i18n';

// Vee-validate
import { Form, Field } from 'vee-validate';

// Composables
import { useSidebarPublishForm } from '../composables/useSidebarPublishForm';

// Pinia
import { usePublishStore } from '../../../publish/stores/publish';

// Components
import BricksInput from '../../../../ui/inputs/BricksInput.vue';
import BricksHexInput from '../../../../ui/inputs/BricksHexInput.vue';
import BricksSelect from '../../../../ui/inputs/BricksSelect.vue';
import BricksTextarea from '../../../../ui/inputs/BricksTextarea.vue';
import BricksCloseButton from '../../../../ui/base/modal/BricksCloseButton.vue';
import BuilderShellSidebarNavigationEditor from './BuilderShellSidebarNavigationEditor.vue';
import BuilderShellSidebarPublishSocialImage from './BuilderShellSidebarPublishSocialImage.vue';
// #endregion

// #region Emits
const emit = defineEmits<{
    close: [];
    openMediaGallery: [];
}>();
// #endregion

// #region Data
const { t } = useI18n();
const publishStore = usePublishStore();
const {
    settings,
    isSubmitting,
    defaultBackgroundColor,
    defaultLayout,
    initialValues,
    formKey,
    layoutOptions,
    layoutFacets,
    panelTitle,
    fullUrlPreview,
    validationSchema,
    handleUpdateField,
    handleMediaSelect,
    handleClearSocialImage,
    handleLayoutChange,
} = useSidebarPublishForm();
// #endregion

// #region Methods
/**
 * Emits close event for parent handler.
 */
function handleClose(): void {
    emit('close');
}

/**
 * Открывает медиагалерею для выбора social image.
 */
function handleOpenMediaGallery(): void {
    emit('openMediaGallery');
}

defineExpose({
    handleMediaSelect,
});
// #endregion
</script>

<template>
    <div :class="$style.BuilderShellSidebarPublishView">
        <div :class="$style.header">
            <h2 :class="$style.title">{{ panelTitle }}</h2>
            <BricksCloseButton :disabled="isSubmitting" @click="handleClose" />
        </div>

        <Form
            :key="formKey"
            :class="[$style.content, 'bricks-scrollbox']"
            :validation-schema="validationSchema"
            :initial-values="initialValues"
        >
            <Transition mode="out-in" name="bricks-fade-fast">
                <div v-if="publishStore.generalError" :class="$style.generalError">
                    {{ publishStore.generalError }}
                </div>
            </Transition>

            <div :class="$style.formGroup">
                <label :class="$style.label">Layout</label>
                <BricksSelect
                    :value="settings.layout || defaultLayout"
                    :specs="layoutOptions"
                    :facets="layoutFacets"
                    :disabled="isSubmitting"
                    @update:value="handleLayoutChange"
                />
            </div>

            <Field v-slot="{ field, errorMessage }" name="pagename">
                <div :class="$style.formGroup">
                    <BricksInput
                        label="Url *"
                        :error-message="errorMessage || publishStore.validationErrors.pagename"
                        :value="field.value"
                        type="slug"
                        :required="true"
                        :max-length="80"
                        placeholder="my-page"
                        :disabled="isSubmitting"
                        @update:value="
                            (val: string) => {
                                field.onChange(val);
                                handleUpdateField('pagename', val);
                            }
                        "
                        @blur="field.onBlur"
                    />
                </div>
            </Field>

            <div :class="$style.formGroup">
                <BricksInput
                    label="URL Prefix"
                    :value="settings.urlPrefix"
                    type="text"
                    placeholder="blog"
                    :max-length="100"
                    :disabled="isSubmitting"
                    @update:value="(val: string) => handleUpdateField('urlPrefix', val || null)"
                />
                <span :class="$style.hint">{{ t('bricks.publish.urlPrefixHint') }}</span>
            </div>

            <div :class="$style.formGroup">
                <BricksInput
                    :label="t('bricks.publish.subdomain')"
                    :value="settings.subdomain"
                    type="text"
                    placeholder="spb"
                    :max-length="63"
                    :disabled="isSubmitting"
                    @update:value="(val: string) => handleUpdateField('subdomain', val || null)"
                />
                <span :class="$style.hint">{{ t('bricks.publish.subdomainHint') }}</span>
            </div>

            <Transition mode="out-in" name="bricks-fade-fast">
                <div v-if="fullUrlPreview" :class="$style.urlPreview">
                    {{ fullUrlPreview }}
                </div>
            </Transition>

            <Field v-slot="{ field, errorMessage }" name="title">
                <div :class="$style.formGroup">
                    <BricksInput
                        :label="t('bricks.publish.titleLabel')"
                        :value="field.value"
                        type="text"
                        :required="true"
                        :max-length="120"
                        :placeholder="t('bricks.publish.titlePlaceholder')"
                        :disabled="isSubmitting"
                        :error-message="errorMessage || publishStore.validationErrors.title"
                        @update:value="
                            (val: string) => {
                                field.onChange(val);
                                handleUpdateField('title', val);
                            }
                        "
                        @blur="field.onBlur"
                    />
                </div>
            </Field>

            <Field v-slot="{ field, errorMessage }" name="description">
                <div :class="$style.formGroup">
                    <BricksTextarea
                        label="Meta Description *"
                        :value="field.value"
                        :max-length="500"
                        :rows="3"
                        placeholder="SEO Description"
                        :disabled="isSubmitting"
                        :error-message="errorMessage || publishStore.validationErrors.description"
                        @update:value="
                            (val: string) => {
                                field.onChange(val);
                                handleUpdateField('description', val);
                            }
                        "
                        @blur="field.onBlur"
                    />
                </div>
            </Field>

            <div :class="$style.formGroup">
                <BricksInput
                    label="Meta Keywords"
                    :value="settings.keywords"
                    type="text"
                    placeholder="promo, page, marketing"
                    :disabled="isSubmitting"
                    @update:value="(val: string) => handleUpdateField('keywords', val)"
                />
            </div>

            <div :class="$style.formGroup">
                <label :class="$style.label">OG/Twitter image</label>
                <BuilderShellSidebarPublishSocialImage
                    :social-image="settings.socialImage || null"
                    :is-submitting="isSubmitting"
                    @open-media-gallery="handleOpenMediaGallery"
                    @clear="handleClearSocialImage"
                />
            </div>

            <div :class="$style.formGroup">
                <label :class="$style.label">{{ t('bricks.publish.backgroundColor') }}</label>
                <BricksHexInput
                    :value="settings.backgroundColor || defaultBackgroundColor"
                    :disabled="isSubmitting"
                    @update:value="(val: string) => handleUpdateField('backgroundColor', val)"
                />
            </div>

            <div :class="$style.formGroup">
                <BuilderShellSidebarNavigationEditor />
            </div>
        </Form>
    </div>
</template>

<style module lang="scss">
.BuilderShellSidebarPublishView {
    overflow-y: auto;
    display: flex;
    flex: 1;
    flex-direction: column;
}

.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.6rem 2rem;
    border-bottom: 1px solid var(--bricks-base-300);
}

.title {
    margin: 0;
    font-size: 1.6rem;
    font-weight: 600;
    color: var(--bricks-base-900);
}

.content {
    overflow-y: auto;
    display: flex;
    flex: 1;
    padding: 1.6rem 2rem;
    flex-direction: column;
}

.formGroup {
    display: flex;
    flex-direction: column;
    margin-bottom: 1.6rem;

    > div {
        padding-bottom: 1.2rem;
    }
}

.label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.8rem;
    font-size: 1.4rem;
    font-weight: 500;
    color: var(--bricks-base-600);
}

.hint {
    margin-top: 0.4rem;
    font-size: 1.2rem;
    color: var(--bricks-base-400);
}

.urlPreview {
    margin-bottom: 1.6rem;
    padding: 0.8rem 1.2rem;
    border-radius: var(--bricks-border-radius-sm);
    background-color: var(--bricks-base-50);
    font-family: monospace;
    font-size: 1.2rem;
    color: var(--bricks-base-600);
    word-break: break-all;
}

.generalError {
    margin-bottom: 1.6rem;
    padding: 1rem 1.2rem;
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid var(--bricks-danger-500);
    background-color: rgb(239 68 68 / 10%);
    font-size: 1.4rem;
    color: var(--bricks-danger-500);
}
</style>
