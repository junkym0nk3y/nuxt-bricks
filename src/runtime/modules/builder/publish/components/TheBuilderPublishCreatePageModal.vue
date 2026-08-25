<script setup lang="ts">
/**
 * @description The page creation form: the meta fields, the choice of the content
 * source (a blank canvas, a template or a JSON file), the "Advanced" section with the
 * routing, the keywords and the device set, and the nested template picker.
 *
 * Decisions held by the markup: the warning about the orphan device keys stands
 * before the submit rather than becoming a toast after it — while the page is not
 * created the set can still be fixed. The action band carries no separator: the body
 * of the modal scrolls with its content, and a line above the buttons would read as
 * the edge of a list. The template picker is a nested window over the form, opened by
 * the "From a template" card the way the file dialog is opened by its neighbor and
 * closed by a pick; it is as wide as the content of the form, since it lists the very
 * templates that end up as a row under the cards.
 *
 * Decisions held by the style section: `fieldLabel` is the label above the tags
 * editor, built the way `BuilderPublishSeoFields` builds its own and for the same
 * reason. The device glyphs are 1.8rem by the design: with no explicit size they
 * inherit the font size of the text.
 */

// #region Imports
// Types
import type { IBricksSchema } from '../../../common/types/brick';
import type { IParsedSchemaFile } from '../types/composables';
import type { TBricksPageDeviceSet } from '../../../common/types/devices';
import type { IBricksTemplateRow, TBricksTemplateSummary } from '../../../common/types/templates';
import type {
    IPublishCreatePageModalProps,
    IPublishCreatePageModalEmits,
    TPublishCreatePageSource,
} from '../types/dashboard';

// Vue
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';

// Utils
import { parseKeywords, serializeKeywords } from '../utils/keywords';
import { resolveDeviceIcon } from '../../../common/utils/bricks/devices';
import { applyDeviceSetToSchema, collectOrphanDeviceKeys } from '../utils/deviceImpact';

// Constants
import { KEYWORDS_MAX_LENGTH } from '../../../common/constants/publish';

// Composables
import { usePublishCreatePageForm } from '../composables/usePublishCreatePageForm';
import { useSchemaFileTransfer } from '../composables/useSchemaFileTransfer';
import { useBricksDevices } from '../../../common/composables/useBricksDevices';
import { useTemplatesData } from '../../templates/composables/useTemplatesData';

// Utils
import { fetchTemplateRequest } from '../../templates/utils/templatesApi';

// Components
import BricksInput from '../../../ui/inputs/BricksInput.vue';
import BricksTagsEditor from '../../../ui/inputs/BricksTagsEditor.vue';
import BricksFieldError from '../../../ui/inputs/BricksFieldError.vue';
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksDisclosure from '../../../ui/base/disclosure/BricksDisclosure.vue';
import BricksModal from '../../../ui/base/modal/BricksModal.vue';
import BricksModalFooter from '../../../ui/base/modal/BricksModalFooter.vue';
import BricksModalHeader from '../../../ui/base/modal/BricksModalHeader.vue';
import BricksFieldHint from '../../../ui/inputs/BricksFieldHint.vue';
import BuilderPublishCreatePageStartOptions from './BuilderPublishCreatePageStartOptions.vue';
import BuilderPublishDevicesModal from './BuilderPublishDevicesModal.vue';
import BuilderTemplatesPickerList from '../../templates/components/BuilderTemplatesPickerList.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IPublishCreatePageModalProps>(), {
    initialTemplate: null,
});
// #endregion

// #region Emits
const emit = defineEmits<IPublishCreatePageModalEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const { fileInputRef, openFilePicker, readSelectedFile } = useSchemaFileTransfer();

/** The source of the content: a picked file makes the page non-empty */
const source = ref<TPublishCreatePageSource>('blank');
const selectedFile = ref<IParsedSchemaFile | null>(null);
const fileError = ref('');

/**
 * The device set of the page being created: `null` — it inherits the set of the
 * project. Edited by the "Devices" group of the "Advanced" section and arrives from
 * the content source — the envelope of a JSON file, or a template.
 */
const viewportConfig = ref<TBricksPageDeviceSet | null>(null);

/**
 * Where the device set came from: from the source (a picked template or file), or
 * from an edit made by hand. A change of the source needs the difference: a set that
 * arrived with the source is obliged to leave with it (otherwise a blank page would
 * be born carrying the steps of a template), while an edit made deliberately by hand
 * a change of the source has no right to wipe.
 */
const isViewportConfigFromSource = ref(false);

const isDevicesModalOpen = ref(false);
const { projectDevices } = useBricksDevices();

/** The template list for picking a source — the same state the section uses */
const { templates, status: templatesStatus, ensureTemplates } = useTemplatesData();

const isTemplatePickerOpen = ref(false);
/** The picked template (a summary) — it signs the row under the cards */
const selectedTemplate = ref<TBricksTemplateSummary | null>(null);
/**
 * The content of the picked template: read right at the pick rather than at the
 * submit. Otherwise the device set of the template and its appearance would arrive
 * after the form had been confirmed — that is, the "Devices" group would show the set
 * of the project while the page would be created with another one.
 */
const selectedTemplateContent = ref<IBricksTemplateRow | null>(null);
const isTemplateLoading = ref(false);
/**
 * The generation of the template pick: reading the content is asynchronous, and in
 * that time another template may be picked, or the pick dropped altogether.
 */
let templateGeneration = 0;

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
    onCreated: (createdAddress) => emit('created', createdAddress),
    resolveSchema: resolveCreateSchema,
    resolveViewportConfig: () => viewportConfig.value,
    // The appearance is handed over only while a template is the active source: the
    // check against `source` is an invariant rather than a belt and braces. The read
    // content of a template lives in the form, and without the check picking a JSON
    // file on top of a template would create a page out of the file but carrying the
    // layout and the background of the template
    resolveAppearance: () =>
        source.value === 'template' && selectedTemplateContent.value
            ? {
                  layout: selectedTemplateContent.value.pageMeta.layout,
                  backgroundColor: selectedTemplateContent.value.pageMeta.backgroundColor,
              }
            : null,
});

const isAdvancedOpen = ref(false);
const host = ref('');
const titleFieldRef = ref<HTMLDivElement | null>(null);

/**
 * The generation of the form: grows on every opening of the modal. By it the parsing
 * of a file that finished after the closing is cut off — see `handleFileSelect`.
 */
let formGeneration = 0;
// #endregion

// #region Computed
/** The live hint of the URL of the page to be, built out of the current form values */
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

const keywordTags = computed<string[]>(() => parseKeywords(String(keywords.value ?? '')));
// #endregion

// #region Computed
/** The set the row shows: either the page's own one or the project's */
const shownDevices = computed(() => viewportConfig.value ?? projectDevices);

const devicesSummary = computed<string>(() => {
    const count = shownDevices.value.length;

    return viewportConfig.value
        ? t('bricks.devices.settingsCustom', { count })
        : t('bricks.devices.settingsInherited', { count });
});

/**
 * The schema components of the picked source — a file or a template: over them the
 * set editor counts how many overrides a removal of a device will carry away. A blank
 * page has no components, and the counter there is honestly zero.
 */
const importedComponents = computed<IBricksSchema['components']>(
    () =>
        selectedFile.value?.schema.components ??
        selectedTemplateContent.value?.schema.components ??
        []
);

/**
 * The device keys of the imported schema that are absent from the set of the page.
 * They are counted against the set that is really going to apply: a file may say
 * nothing about a set, and then the steps are dictated by the project. Such overrides
 * are not removed but are not applied either — without a warning the divergence of
 * the layout looks like a bug of the renderer.
 */
const orphanDeviceKeys = computed<string[]>(() =>
    collectOrphanDeviceKeys(
        importedComponents.value,
        shownDevices.value.map((device) => device.key)
    )
);
// #endregion

// #region Methods
/**
 * Applies a device set to the page being created. The keys that are gone get swept
 * out of the schema of the picked source: the removal confirmation promises to remove
 * the overrides of the device, and the page is created out of that very schema —
 * leaving them in would write exactly what was promised to be removed. The file is
 * replaced whole rather than edited in place: the number of blocks and the list of
 * orphans lie next to it, and editing the schema past them would give an object out
 * of step with itself.
 *
 * @param config - The set of the page, or `null` (inheriting the set of the project).
 */
function handleDevicesSave(config: TBricksPageDeviceSet | null): void {
    const previousKeys = shownDevices.value.map((device) => device.key);
    const nextKeys = (config ?? projectDevices).map((device) => device.key);
    const file = selectedFile.value;

    if (file) {
        const schema = applyDeviceSetToSchema(file.schema, previousKeys, nextKeys);

        if (schema !== file.schema) {
            selectedFile.value = { ...file, schema };
        }
    }

    // The same sweep on the source template. The template in the database is not
    // changed by it — only the copy lying in the form is edited
    const templateContent = selectedTemplateContent.value;

    if (templateContent) {
        const schema = applyDeviceSetToSchema(templateContent.schema, previousKeys, nextKeys);

        if (schema !== templateContent.schema) {
            selectedTemplateContent.value = { ...templateContent, schema };
        }
    }

    viewportConfig.value = config;
    isViewportConfigFromSource.value = false;
}

/** Closes the modal (the form is reset on the next opening) */
function handleClose(): void {
    if (isSubmitting.value) {
        return;
    }
    emit('close');
}

/**
 * Returns the keywords into the form as a string — the tags live inside the editor
 * only.
 *
 * @param tags - The current tag list.
 */
function handleKeywordsChange(tags: string[]): void {
    keywords.value = serializeKeywords(tags);
}

/**
 * Hands the schema of the page being created over to the form. A blank canvas is
 * handed over at once, while a picked file first travels into the image resolver of
 * the dashboard owner: before the page is created a decision has to be made about the
 * URLs absent from the media library.
 *
 * @returns The schema to write, or `null` when the creation was canceled.
 */
async function resolveCreateSchema(): Promise<IBricksSchema | null> {
    if (source.value === 'file' && selectedFile.value) {
        return await props.resolveImportedSchema(selectedFile.value.schema);
    }

    if (source.value === 'template') {
        // There is no content — the submit broke past the disabled button (while
        // the reading runs it is blocked). A blank canvas would be the worst outcome
        // here: a person is sure they are creating a page out of a template and
        // would get an empty one
        if (!selectedTemplateContent.value) {
            fileError.value = t('bricks.templates.errors.contentReadFailed');
            return null;
        }

        // The schema of a template goes through the image resolver as well, even
        // though it came out of our own database: the file it refers to may have
        // been deleted from the media library after the template was saved, and then
        // the decision about the broken link is a person's to make
        return await props.resolveImportedSchema(selectedTemplateContent.value.schema);
    }

    return { components: [] };
}

/** Returns the source to a blank page */
function handleSelectBlank(): void {
    clearTemplateSelection();
    source.value = 'blank';
    selectedFile.value = null;
    fileError.value = '';
}

/**
 * Drops the picked template together with the content that was read and with the
 * device set it brought along. The generation grows right here: the dropping is
 * obliged to cut off a read of the content still in flight — otherwise it would
 * arrive and would return the source to a template the person is no longer picking.
 * The device set is reset only when the source brought it.
 */
function clearTemplateSelection(): void {
    templateGeneration += 1;
    selectedTemplate.value = null;
    selectedTemplateContent.value = null;
    isTemplateLoading.value = false;

    if (isViewportConfigFromSource.value) {
        viewportConfig.value = null;
        isViewportConfigFromSource.value = false;
    }
}

/** Opens the dialog for picking a JSON file */
function handlePickFile(): void {
    fileError.value = '';
    openFilePicker();
}

/**
 * Parses the picked file and makes it the source of the content. A parsing error
 * leaves the choice on a blank page and does not block the creation: a person will
 * either take another file or create a blank canvas.
 *
 * The outcome is applied only to the opening of the modal the file was picked in:
 * reading a large file outlives a closing, and without this check a parsing that
 * finished would put the file of the previous session into the form of a new page.
 */
async function handleFileSelect(): Promise<void> {
    const startedIn = formGeneration;
    const result = await readSelectedFile(fileInputRef.value);

    if (!result || startedIn !== formGeneration) {
        return;
    }

    if (result.status === 'error') {
        // A broken file returns the source to a blank page — together with the
        // template if one was picked: otherwise the form would show its row, would
        // count a blank page as the active source and would create an empty schema
        // carrying the device set of the template
        clearTemplateSelection();
        fileError.value = result.message;
        source.value = 'blank';
        selectedFile.value = null;
        return;
    }

    // A file displaces a template whole: there is one source, and the content of a
    // template left behind would travel into the page as its appearance
    clearTemplateSelection();
    fileError.value = '';
    selectedFile.value = result.file;
    source.value = 'file';

    // An envelope carries a device set, so it is taken: the `props.responsive` keys
    // of the imported schema refer to that very set. A file that says nothing about a
    // set leaves the page being created inheriting
    if (result.file.viewportConfig !== undefined) {
        viewportConfig.value = result.file.viewportConfig;
        isViewportConfigFromSource.value = true;
    }
}

/** Opens the template picker and starts a read of the list unless it has been read */
function handlePickTemplate(): void {
    fileError.value = '';
    isTemplatePickerOpen.value = true;
    ensureTemplates();
}

/** Closes the template picker without changing the source */
function handleCloseTemplatePicker(): void {
    isTemplatePickerOpen.value = false;
}

/**
 * Takes the picked template: reads its content and makes it the source. The content
 * is read here rather than at the submit, because the device set and the appearance
 * are taken out of it and a person has to see them in the form before the page is
 * created. A refused read returns the source to a blank page — creating one is still
 * possible.
 *
 * @param template - The summary of the picked template.
 */
async function handleTemplateSelect(template: TBricksTemplateSummary): Promise<void> {
    templateGeneration += 1;

    const generation = templateGeneration;

    isTemplatePickerOpen.value = false;
    selectedFile.value = null;
    fileError.value = '';
    selectedTemplate.value = template;
    selectedTemplateContent.value = null;
    source.value = 'template';
    isTemplateLoading.value = true;

    try {
        const content = await fetchTemplateRequest(template.id);

        if (generation !== templateGeneration) {
            return;
        }

        selectedTemplateContent.value = content;
        // The device set of a template is what its page was assembled in; a `null`
        // there is a legitimate "inherits the set of the project"
        viewportConfig.value = content.pageMeta.viewportConfig;
        isViewportConfigFromSource.value = true;
    } catch (error: unknown) {
        if (generation !== templateGeneration) {
            return;
        }

        console.error('[Publish] Failed to read the template content:', error);
        fileError.value = t('bricks.templates.errors.contentReadFailed');
        selectedTemplate.value = null;
        source.value = 'blank';
    } finally {
        if (generation === templateGeneration) {
            isTemplateLoading.value = false;
        }
    }
}
// #endregion

// #region Lifecycle
watch(
    () => props.isOpen,
    async (isOpen) => {
        if (!isOpen) {
            return;
        }
        formGeneration += 1;
        resetToEmpty();
        isAdvancedOpen.value = false;
        isTemplatePickerOpen.value = false;
        // The set of the previously created page must not reach the next one
        viewportConfig.value = null;
        isViewportConfigFromSource.value = false;
        // The source, the template and its content are reset right here
        handleSelectBlank();

        // The form may have been opened by a template card — then the source is
        // picked in advance. The promise is deliberately not awaited: the focus has
        // to land in the title field at once rather than after the content of the
        // template has been read
        if (props.initialTemplate) {
            handleTemplateSelect(props.initialTemplate);
        }

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
            <BricksModalHeader :close-disabled="isSubmitting" @close="handleClose" />

            <div :class="$style.body">
                <div ref="titleFieldRef" :class="$style.field">
                    <BricksInput
                        :label="t('bricks.publish.dashboard.createModal.titleLabel')"
                        :value="title"
                        type="text"
                        :max-length="120"
                        :placeholder="t('bricks.publish.titlePlaceholder')"
                        :disabled="isSubmitting"
                        :error-message="errors.title"
                        @update:value="(val: string) => (title = val)"
                    />
                </div>

                <div :class="$style.field">
                    <BricksInput
                        :label="t('bricks.publish.seo.pagenameLabel')"
                        :value="pagename"
                        type="slug"
                        :max-length="80"
                        placeholder="my-page"
                        :disabled="isSubmitting"
                        :error-message="errors.pagename"
                        @update:value="setPagename"
                    />
                    <BricksFieldHint v-if="urlHint">{{ urlHint }}</BricksFieldHint>
                </div>

                <div :class="$style.field">
                    <BricksInput
                        :label="t('bricks.publish.seo.descriptionLabel')"
                        :value="description"
                        type="text"
                        :max-length="500"
                        :placeholder="
                            t('bricks.publish.dashboard.createModal.descriptionPlaceholder')
                        "
                        :disabled="isSubmitting"
                        :error-message="errors.description"
                        @update:value="(val: string) => (description = val)"
                    />
                </div>

                <BuilderPublishCreatePageStartOptions
                    :source="source"
                    :selected-file="selectedFile"
                    :selected-template="selectedTemplate"
                    :error="fileError"
                    :is-submitting="isSubmitting"
                    @select-blank="handleSelectBlank"
                    @pick-file="handlePickFile"
                    @clear-file="handleSelectBlank"
                    @pick-template="handlePickTemplate"
                    @clear-template="handleSelectBlank"
                />

                <input
                    ref="fileInputRef"
                    type="file"
                    accept=".json"
                    :class="$style.hiddenInput"
                    @change="handleFileSelect"
                />

                <BricksDisclosure
                    v-model:value="isAdvancedOpen"
                    :label="t('bricks.publish.dashboard.createModal.advanced')"
                >
                    <div :class="$style.advancedFields">
                        <div :class="$style.field">
                            <BricksInput
                                label="URL Prefix"
                                :value="urlPrefix"
                                type="text"
                                :max-length="100"
                                placeholder="blog"
                                :disabled="isSubmitting"
                                :error-message="errors.urlPrefix"
                                @update:value="(val: string) => (urlPrefix = val)"
                            />
                            <BricksFieldHint>
                                {{ t('bricks.publish.urlPrefixHint') }}
                            </BricksFieldHint>
                        </div>
                        <div :class="$style.field">
                            <BricksInput
                                :label="t('bricks.publish.subdomain')"
                                :value="subdomain"
                                type="text"
                                :max-length="63"
                                placeholder="spb"
                                :disabled="isSubmitting"
                                :error-message="errors.subdomain"
                                @update:value="(val: string) => (subdomain = val)"
                            />
                            <BricksFieldHint>
                                {{ t('bricks.publish.subdomainHint') }}
                            </BricksFieldHint>
                        </div>
                        <div :class="$style.field">
                            <div :class="$style.fieldLabel">
                                <span>{{ t('bricks.publish.seo.keywordsLabel') }}</span>
                                <span :class="$style.charCount">
                                    {{ String(keywords ?? '').length }}/{{ KEYWORDS_MAX_LENGTH }}
                                </span>
                            </div>
                            <BricksTagsEditor
                                :model-value="keywordTags"
                                :aria-label="t('bricks.publish.seo.keywordsLabel')"
                                :placeholder="t('bricks.publish.seo.keywordsPlaceholder')"
                                :max-length="KEYWORDS_MAX_LENGTH"
                                :disabled="isSubmitting"
                                :error-message="errors.keywords"
                                @update:model-value="handleKeywordsChange"
                            />
                        </div>
                        <div :class="$style.field">
                            <span :class="$style.fieldLabel">
                                {{ t('bricks.devices.settingsGroup') }}
                            </span>
                            <div :class="$style.devices">
                                <div :class="$style.deviceIcons">
                                    <BricksIcon
                                        v-for="device in shownDevices"
                                        :key="device.key"
                                        :icon="resolveDeviceIcon(device.icon)"
                                        :title="device.label"
                                    />
                                    <span :class="$style.devicesSummary">{{ devicesSummary }}</span>
                                </div>
                                <BricksButton
                                    variant="ghost"
                                    size="sm"
                                    :disabled="isSubmitting"
                                    @click="isDevicesModalOpen = true"
                                >
                                    {{ t('bricks.devices.settingsAction') }}
                                </BricksButton>
                            </div>
                            <span v-if="orphanDeviceKeys.length > 0" :class="$style.devicesOrphans">
                                {{
                                    t('bricks.devices.orphanKeys', {
                                        keys: orphanDeviceKeys.join(', '),
                                    })
                                }}
                            </span>
                        </div>
                    </div>
                </BricksDisclosure>

                <BricksFieldError :message="generalError" />
            </div>

            <BricksModalFooter variant="plain">
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
                    :disabled="isSubmitting || isTemplateLoading"
                    @click="submitForm"
                >
                    {{ t('bricks.publish.dashboard.createModal.submit') }}
                </BricksButton>
            </BricksModalFooter>
        </div>
    </BricksModal>

    <BuilderPublishDevicesModal
        :is-open="isDevicesModalOpen"
        :viewport-config="viewportConfig"
        :project-devices="projectDevices"
        :active-device-key="''"
        :schema-components="importedComponents"
        layer="nested"
        @close="isDevicesModalOpen = false"
        @save="handleDevicesSave"
    />

    <BricksModal
        :is-open="isTemplatePickerOpen"
        :title="t('bricks.templates.picker.title')"
        variant="gradient"
        padded
        layer="nested"
        @close="handleCloseTemplatePicker"
    >
        <div :class="$style.picker">
            <BricksModalHeader @close="handleCloseTemplatePicker" />

            <div :class="$style.pickerBody">
                <BuilderTemplatesPickerList
                    :templates="templates"
                    :is-loading="templatesStatus === 'loading'"
                    :selected-template-id="selectedTemplate?.id ?? null"
                    @select="handleTemplateSelect"
                />
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
    border-radius: var(--bricks-border-radius-md);
    background: var(--bricks-base-0);
    box-shadow: var(--bricks-shadow-lg);
    flex-direction: column;
}

.body {
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
    padding: 2rem 2rem 0.8rem;
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
    margin-bottom: 0.2rem;
    font-size: 1.4rem;
    font-weight: 500;
    color: var(--bricks-base-600);
}

.charCount {
    flex-shrink: 0;
    font-size: 1.2rem;
    font-weight: 400;
    color: var(--bricks-base-500);
}

.hiddenInput {
    position: absolute;
    overflow: hidden;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
}

.devices {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    padding: 0.8rem 1.2rem;
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-surface-raised);
}

.deviceIcons {
    display: flex;
    align-items: center;
    font-size: 1.8rem;
    color: var(--bricks-base-600);
    gap: 0.8rem;
}

.devicesSummary {
    margin-left: 0.4rem;
    font-size: 1.2rem;
    color: var(--bricks-base-500);
}

.devicesOrphans {
    margin-top: 0.4rem;
    font-size: 1.1rem;
    color: var(--bricks-yellow);
}

.advancedFields {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
}

.picker {
    overflow: hidden;
    display: flex;
    width: 100%;
    max-width: 48rem;
    border-radius: var(--bricks-border-radius-md);
    background: var(--bricks-base-0);
    box-shadow: var(--bricks-shadow-lg);
    flex-direction: column;
}

.pickerBody {
    padding: 1.2rem 1.6rem 1.6rem;
}
</style>
