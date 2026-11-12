<script setup lang="ts">
/**
 * @description Publish settings inside the sidebar: the publication card of a saved
 * page, the layout, the device set of the page, the SEO fields together with the
 * address, the social image, the background color and the navigation items.
 *
 * The publication card is the one of the dashboard details panel: the switch writes to
 * the server at once (the write belongs to the page — `useBuilderPublishToggle` — because
 * it has to reach the saved snapshot of the session), and the URL is built out of the
 * SAVED row of the page rather than out of the form: the card links to the live page,
 * and an address typed into the form but not saved yet has no page behind it. The
 * address the form will give the page is what the URL preview under the address fields
 * is for.
 *
 * The values come from the store rather than from the form: the source of truth of
 * the sidebar is `currentFormState`, while the form holds the validation only — what
 * that costs every write is spelled out at `handleSeoFieldUpdate`.
 *
 * Two decisions held by the style section: the device group is a column rather than a
 * row, because inside the 28rem of the sidebar a button next to the chips shrank
 * until its caption wrapped onto two lines, and the design puts it underneath at full
 * width; and the prefix, the subdomain and the full URL preview live in the slot of
 * the shared SEO component and keep its spacing between fields, because they are a
 * continuation of the address field.
 */

// #region Imports
// Types
import type { TPublishFormErrors } from '../../../publish/types/dashboard';
import type { TPublishedPageSummary } from '../../../../common/types/bricks-api';
import type { TBricksPageDeviceSet } from '../../../../common/types/devices';
import type { ISidebarPublishViewEmits } from '../types/components';

// Vue
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Vee-validate
import { Form } from 'vee-validate';

// Composables
import { useSidebarPublishForm } from '../composables/useSidebarPublishForm';
import { usePublishDetailsUrl } from '../../../publish/composables/usePublishDetailsUrl';
import { useBuilderPermissions } from '../../../core/composables/useBuilderPermissions';
import { useBuilderToast } from '../../../core/composables/useBuilderToast';

// Pinia
import { usePublishStore } from '../../../publish/stores/publish';
import { useCanvasStore } from '../../../core/stores/canvas';
import { useComponentsStore } from '../../../core/stores/components';

// Composables
import { useBricksDevices } from '../../../../common/composables/useBricksDevices';

// Utils
import { resolveDeviceIcon } from '../../../../common/utils/bricks/devices';

// Components
import BricksInput from '../../../../ui/inputs/BricksInput.vue';
import BricksHexInput from '../../../../ui/inputs/BricksHexInput.vue';
import BricksSelect from '../../../../ui/inputs/BricksSelect.vue';
import BricksButton from '../../../../ui/base/button/BricksButton.vue';
import BricksCloseButton from '../../../../ui/base/modal/BricksCloseButton.vue';
import BricksFieldHint from '../../../../ui/inputs/BricksFieldHint.vue';
import BuilderPublishDevicesModal from '../../../publish/components/BuilderPublishDevicesModal.vue';
import BuilderPublishSeoFields from '../../../publish/components/BuilderPublishSeoFields.vue';
import BuilderPublishPublicationCard from '../../../publish/components/BuilderPublishPublicationCard.vue';
import BuilderShellSidebarNavigationEditor from './BuilderShellSidebarNavigationEditor.vue';
import BuilderShellSidebarPublishSocialImage from './BuilderShellSidebarPublishSocialImage.vue';
// #endregion

// #region Emits
const emit = defineEmits<ISidebarPublishViewEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const publishStore = usePublishStore();
const canvasStore = useCanvasStore();
const componentsStore = useComponentsStore();
const { projectDevices } = useBricksDevices();
const { canEdit } = useBuilderPermissions();
const { showToast } = useBuilderToast();

const isDevicesModalOpen = ref(false);
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

/**
 * Fields the user has already touched.
 *
 * The form validates the schema right at mount and fills `errors` for every path in
 * it — on a new page that means red "required" marks before the first click. The
 * `<Field>` wrappers used to save us from that: they kept the error inside their own
 * scope and did not show it until an interaction. The wrappers are gone, so the
 * "field was touched" mark is kept here by hand.
 */
const touchedFields = ref<Set<string>>(new Set());
// #endregion

// #region Computed
/**
 * Caption of the group: whether the page inherits the project set, and how many
 * devices it holds.
 */
const devicesSummary = computed<string>(() => {
    const count = canvasStore.devices.length;

    return publishStore.currentFormState.viewportConfig
        ? t('bricks.devices.settingsCustom', { count })
        : t('bricks.devices.settingsInherited', { count });
});

/**
 * The saved row of the open page; `null` for a page that has never been saved — it has
 * nothing to publish yet, and the card is not shown.
 */
const savedPage = computed<TPublishedPageSummary | null>(() =>
    publishStore.editingPageId === null
        ? null
        : (publishStore.getPageById(publishStore.editingPageId) ?? null)
);

const { liveUrl, liveHref, copyLiveUrl } = usePublishDetailsUrl({
    pagename: computed(() => savedPage.value?.pagename ?? ''),
    urlPrefix: computed(() => savedPage.value?.urlPrefix ?? ''),
    subdomain: computed(() => savedPage.value?.subdomain ?? ''),
});
// #endregion

// #region Methods
/**
 * Writes the device set into the editor state.
 *
 * It travels to the server with the ordinary page save: the set and the schema are
 * one state, and a targeted PATCH would go past the version snapshot.
 *
 * @param config - Set of the page, or `null` for inheritance.
 */
function handleSaveDevices(config: TBricksPageDeviceSet | null): void {
    publishStore.currentFormState.viewportConfig = config;
}

/**
 * The error of one field, out of two sources: the live yup schema of the form (for
 * touched fields only) and the pre-publish check that writes into the store. The
 * second source is always shown: it appears on an explicit action of the user and
 * survives leaving the field.
 *
 * @param formErrors - vee-validate errors of the current form.
 * @param field - Name of the form field.
 * @returns Error text, or undefined.
 */
function fieldError(
    formErrors: Record<string, string | undefined>,
    field: string
): string | undefined {
    return (
        (touchedFields.value.has(field) ? formErrors[field] : undefined) ||
        publishStore.validationErrors[field]
    );
}

/**
 * Collects the errors of the SEO fields for the shared SEO component.
 *
 * @param formErrors - vee-validate errors of the current form.
 * @returns Errors keyed by field.
 */
function mergeSeoErrors(formErrors: Record<string, string | undefined>): TPublishFormErrors {
    return {
        title: fieldError(formErrors, 'title'),
        pagename: fieldError(formErrors, 'pagename'),
        description: fieldError(formErrors, 'description'),
        keywords: fieldError(formErrors, 'keywords'),
        headCode: fieldError(formErrors, 'headCode'),
        bodyEndCode: fieldError(formErrors, 'bodyEndCode'),
    };
}

/**
 * Writes the value of an SEO field both into the store — the source of truth of the
 * sidebar — and into the vee-validate form, otherwise the schema would check the
 * previous value.
 *
 * @param setFieldValue - Form value setter from the `<Form>` slot.
 * @param field - Name of the field.
 * @param value - New value.
 */
function handleSeoFieldUpdate(
    setFieldValue: (field: string, value: string) => void,
    field: 'title' | 'pagename' | 'description' | 'keywords' | 'headCode' | 'bodyEndCode',
    value: string
): void {
    if (!touchedFields.value.has(field)) {
        touchedFields.value = new Set(touchedFields.value).add(field);
    }

    setFieldValue(field, value);
    handleUpdateField(field, value);
}

/**
 * Writes a routing field into the form and into the store. In the store an empty
 * string is normalized to null — that is how the field travels in the payload — while
 * the schema needs a string and coerces an empty value to null on its own.
 *
 * @param setFieldValue - Form value setter from the `<Form>` slot.
 * @param field - Name of the field.
 * @param value - New value.
 */
function handleRoutingFieldUpdate(
    setFieldValue: (field: string, value: string) => void,
    field: 'urlPrefix' | 'subdomain',
    value: string
): void {
    if (!touchedFields.value.has(field)) {
        touchedFields.value = new Set(touchedFields.value).add(field);
    }

    setFieldValue(field, value);
    handleUpdateField(field, value || null);
}

/**
 * Writes the noindex flag into the store. The flag is not validated, so the form is
 * left alone.
 *
 * @param value - New value of the flag.
 */
function handleNoindexUpdate(value: boolean): void {
    handleUpdateField('noindex', value);
}

/**
 * Passes the publication switch to the page, which owns the write.
 *
 * @param published - The new publication flag.
 */
function handleTogglePublished(published: boolean): void {
    emit('togglePublished', published);
}

/**
 * Copies the live URL of the page and shows a toast with the result.
 */
async function handleCopyUrl(): Promise<void> {
    const copied = await copyLiveUrl();

    if (copied) {
        showToast(t('bricks.publish.dashboard.details.toasts.urlCopied'), 'success');
    } else {
        showToast(t('bricks.publish.dashboard.details.toasts.copyFailed'), 'error');
    }
}

/**
 * Emits close event for parent handler.
 */
function handleClose(): void {
    emit('close');
}

/**
 * Asks for the media gallery so a social image can be picked.
 */
function handleOpenMediaGallery(): void {
    emit('openMediaGallery');
}

defineExpose({
    handleMediaSelect,
});
// #endregion

// #region Lifecycle
// A change of page rebuilds the form (`formKey`), and the "field was touched" marks
// of the previous page have to go with it, otherwise its errors show up at once
watch(formKey, () => {
    touchedFields.value = new Set();
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
            v-slot="{ errors, setFieldValue }"
            :class="[$style.content, 'bricks-scrollbox']"
            :validation-schema="validationSchema"
            :initial-values="initialValues"
        >
            <Transition mode="out-in" name="bricks-fade-fast">
                <div v-if="publishStore.generalError" :class="$style.generalError">
                    {{ publishStore.generalError }}
                </div>
            </Transition>

            <BuilderPublishPublicationCard
                v-if="savedPage"
                :class="$style.publication"
                :published="settings.published === true"
                :live-url="liveUrl"
                :live-href="liveHref"
                :disabled="!canEdit || isSubmitting"
                @toggle-published="handleTogglePublished"
                @copy-url="handleCopyUrl"
            />

            <div :class="$style.formGroup">
                <label :class="$style.label">{{ t('bricks.publish.layout') }}</label>
                <BricksSelect
                    :value="settings.layout || defaultLayout"
                    :specs="layoutOptions"
                    :facets="layoutFacets"
                    :disabled="isSubmitting"
                    :aria-label="t('bricks.publish.layout')"
                    @update:value="handleLayoutChange"
                />
            </div>

            <div :class="$style.formGroup">
                <span :class="$style.label">{{ t('bricks.devices.settingsGroup') }}</span>
                <div :class="$style.devices">
                    <div :class="$style.deviceIcons">
                        <BricksIcon
                            v-for="device in canvasStore.devices"
                            :key="device.key"
                            :icon="resolveDeviceIcon(device.icon)"
                            :title="device.label"
                        />
                        <span :class="$style.devicesSummary">{{ devicesSummary }}</span>
                    </div>
                    <BricksButton
                        :class="$style.devicesAction"
                        variant="ghost"
                        size="sm"
                        :disabled="isSubmitting"
                        @click="isDevicesModalOpen = true"
                    >
                        {{ t('bricks.devices.settingsAction') }}
                    </BricksButton>
                </div>
            </div>

            <BuilderPublishSeoFields
                :class="$style.seoFields"
                :title="settings.title || ''"
                :pagename="settings.pagename || ''"
                :description="settings.description || ''"
                :keywords="settings.keywords || ''"
                :noindex="settings.noindex === true"
                :head-code="settings.headCode || ''"
                :body-end-code="settings.bodyEndCode || ''"
                :errors="mergeSeoErrors(errors)"
                :disabled="isSubmitting"
                @update:title="(val: string) => handleSeoFieldUpdate(setFieldValue, 'title', val)"
                @update:pagename="
                    (val: string) => handleSeoFieldUpdate(setFieldValue, 'pagename', val)
                "
                @update:description="
                    (val: string) => handleSeoFieldUpdate(setFieldValue, 'description', val)
                "
                @update:keywords="
                    (val: string) => handleSeoFieldUpdate(setFieldValue, 'keywords', val)
                "
                @update:noindex="handleNoindexUpdate"
                @update:head-code="
                    (val: string) => handleSeoFieldUpdate(setFieldValue, 'headCode', val)
                "
                @update:body-end-code="
                    (val: string) => handleSeoFieldUpdate(setFieldValue, 'bodyEndCode', val)
                "
            >
                <template #address>
                    <div :class="$style.addressFields">
                        <div :class="$style.addressField">
                            <BricksInput
                                :label="t('bricks.publish.urlPrefix')"
                                :value="settings.urlPrefix"
                                type="text"
                                placeholder="blog"
                                :max-length="100"
                                :disabled="isSubmitting"
                                :error-message="fieldError(errors, 'urlPrefix')"
                                @update:value="
                                    (val: string) =>
                                        handleRoutingFieldUpdate(setFieldValue, 'urlPrefix', val)
                                "
                            />
                            <BricksFieldHint>{{
                                t('bricks.publish.urlPrefixHint')
                            }}</BricksFieldHint>
                        </div>

                        <div :class="$style.addressField">
                            <BricksInput
                                :label="t('bricks.publish.subdomain')"
                                :value="settings.subdomain"
                                type="text"
                                placeholder="spb"
                                :max-length="63"
                                :disabled="isSubmitting"
                                :error-message="fieldError(errors, 'subdomain')"
                                @update:value="
                                    (val: string) =>
                                        handleRoutingFieldUpdate(setFieldValue, 'subdomain', val)
                                "
                            />
                            <BricksFieldHint>{{
                                t('bricks.publish.subdomainHint')
                            }}</BricksFieldHint>
                        </div>

                        <Transition mode="out-in" name="bricks-fade-fast">
                            <div v-if="fullUrlPreview" :class="$style.urlPreview">
                                {{ fullUrlPreview }}
                            </div>
                        </Transition>
                    </div>

                    <BuilderPublishDevicesModal
                        :is-open="isDevicesModalOpen"
                        :viewport-config="publishStore.currentFormState.viewportConfig ?? null"
                        :project-devices="projectDevices"
                        :active-device-key="canvasStore.viewport"
                        :schema-components="componentsStore.components"
                        @close="isDevicesModalOpen = false"
                        @save="handleSaveDevices"
                    />
                </template>
            </BuilderPublishSeoFields>

            <div :class="$style.formGroup">
                <label :class="$style.label">{{ t('bricks.publish.socialImage') }}</label>
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
.devices {
    display: flex;
    padding: 1.2rem;
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-surface-raised);
    flex-direction: column;
    gap: 1rem;
}

.deviceIcons {
    display: flex;
    align-items: center;
    font-size: 1.8rem;
    color: var(--bricks-base-600);
    gap: 0.8rem;
}

.devicesSummary {
    font-size: 1.2rem;
    color: var(--bricks-base-500);
}

.devicesAction {
    width: 100%;
}

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

.seoFields {
    margin-bottom: 1.6rem;
}

.publication {
    margin-bottom: 1.6rem;
}

.addressFields {
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
}

.addressField {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
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

.urlPreview {
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
