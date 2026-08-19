<script setup lang="ts">
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
import BricksCloseButton from '../../../ui/base/modal/BricksCloseButton.vue';
import BricksModal from '../../../ui/base/modal/BricksModal.vue';
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

/** Источник содержимого: выбранный файл делает страницу непустой. */
const source = ref<TPublishCreatePageSource>('blank');
const selectedFile = ref<IParsedSchemaFile | null>(null);
const fileError = ref('');

/**
 * Набор устройств создаваемой страницы: `null` — наследует набор проекта.
 * Правится группой «Устройства» в секции «Дополнительно» и приезжает из
 * источника содержимого — конверта JSON-файла либо шаблона.
 */
const viewportConfig = ref<TBricksPageDeviceSet | null>(null);

/**
 * Откуда взялся набор устройств: `source` — принёс выбранный шаблон или файл,
 * `manual` — правка человека.
 *
 * Различие нужно смене источника: набор, пришедший вместе с источником, обязан
 * уйти вместе с ним (иначе пустая страница родилась бы со ступенями шаблона), а
 * ручную правку смена источника стирать не вправе — её делали осознанно.
 */
const isViewportConfigFromSource = ref(false);

const isDevicesModalOpen = ref(false);
const { projectDevices } = useBricksDevices();

/** Список шаблонов для выбора источника — то же состояние, что у раздела. */
const { templates, status: templatesStatus, ensureTemplates } = useTemplatesData();

const isTemplatePickerOpen = ref(false);
/** Выбранный шаблон (сводка) — им подписана строка под карточками. */
const selectedTemplate = ref<TBricksTemplateSummary | null>(null);
/**
 * Содержимое выбранного шаблона: читается сразу при выборе, а не при сабмите.
 *
 * Иначе набор устройств шаблона и его оформление приезжали бы уже после
 * подтверждения формы — то есть группа «Устройства» показывала бы проектный
 * набор, а создалась бы страница с другим.
 */
const selectedTemplateContent = ref<IBricksTemplateRow | null>(null);
const isTemplateLoading = ref(false);
/**
 * Поколение выбора шаблона: чтение содержимого асинхронно, и за это время можно
 * выбрать другой шаблон либо снять выбор вовсе.
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
    // Оформление отдаётся только пока шаблон и есть активный источник: сверка с
    // `source` — не перестраховка, а инвариант. Прочитанное содержимое шаблона
    // живёт в форме, и без неё выбор JSON-файла поверх шаблона создал бы страницу
    // из файла, но с раскладкой и фоном шаблона
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
 * Поколение формы: растёт на каждом открытии модалки. Им отсекается разбор
 * файла, завершившийся уже после закрытия — см. `handleFileSelect`.
 */
let formGeneration = 0;
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

const keywordTags = computed<string[]>(() => parseKeywords(String(keywords.value ?? '')));
// #endregion

// #region Computed
/** Набор, который показывает строка: свой у страницы либо проектный. */
const shownDevices = computed(() => viewportConfig.value ?? projectDevices);

const devicesSummary = computed<string>(() => {
    const count = shownDevices.value.length;

    return viewportConfig.value
        ? t('bricks.devices.settingsCustom', { count })
        : t('bricks.devices.settingsInherited', { count });
});

/**
 * Компоненты схемы выбранного источника — файла или шаблона: по ним редактор
 * набора считает, сколько переопределений унесёт удаление устройства. Пустая
 * страница компонентов не имеет, и счётчик там честно нулевой.
 */
const importedComponents = computed<IBricksSchema['components']>(
    () =>
        selectedFile.value?.schema.components ??
        selectedTemplateContent.value?.schema.components ??
        []
);

/**
 * Ключи устройств из импортируемой схемы, которых в наборе страницы нет.
 *
 * Считаются против набора, который реально будет действовать: файл может о
 * наборе молчать, и тогда ступени задаёт проект. Такие переопределения не
 * удаляются, но и не применяются — без предупреждения расхождение раскладки
 * выглядит как баг рендера.
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
 * Применяет набор устройств к создаваемой странице.
 *
 * Исчезнувшие ключи вычищаются из схемы выбранного файла: подтверждение удаления
 * обещает удалить переопределения устройства, а страница создаётся из этой самой
 * схемы — оставив их, мы записали бы ровно то, что обещали удалить. Файл
 * заменяется целиком, а не правится на месте: у него рядом лежат число блоков и
 * список сирот, и правка схемы в обход них дала бы рассогласованный объект.
 *
 * @param config - Набор страницы либо `null` (наследование набора проекта).
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

    // Та же чистка у шаблона-источника, и по той же причине: страница создаётся
    // из этой схемы, и оставленные переопределения были бы ровно тем, что
    // подтверждение обещало удалить. Сам шаблон в базе при этом не меняется —
    // правится только копия, лежащая в форме
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

/**
 * Возвращает ключевые слова в форму строкой — теги живут только в редакторе.
 *
 * @param tags - Актуальный список тегов.
 */
function handleKeywordsChange(tags: string[]): void {
    keywords.value = serializeKeywords(tags);
}

/**
 * Отдаёт схему создаваемой страницы форме.
 *
 * Пустой холст отдаётся сразу. Выбранный файл сначала уходит в резолвер картинок
 * владельца дашборда: до создания страницы нужно решить, что делать с URL,
 * которых нет в медиатеке.
 *
 * @returns Схема к записи либо `null`, если создание отменено.
 */
async function resolveCreateSchema(): Promise<IBricksSchema | null> {
    if (source.value === 'file' && selectedFile.value) {
        return await props.resolveImportedSchema(selectedFile.value.schema);
    }

    if (source.value === 'template') {
        // Содержимого нет — сабмит прорвался мимо выключенной кнопки (пока идёт
        // чтение, она заблокирована). Пустой холст здесь был бы худшим исходом:
        // человек уверен, что создаёт страницу из шаблона, а получил бы чистую
        if (!selectedTemplateContent.value) {
            fileError.value = t('bricks.templates.errors.contentReadFailed');
            return null;
        }

        // Схема шаблона тоже идёт через резолвер картинок, хотя пришла из своей же
        // базы: файл, на который она ссылается, могли удалить из медиатеки после
        // сохранения шаблона, и тогда решение о битой ссылке принимает человек
        return await props.resolveImportedSchema(selectedTemplateContent.value.schema);
    }

    return { components: [] };
}

/**
 * Возвращает источник к пустой странице.
 */
function handleSelectBlank(): void {
    clearTemplateSelection();
    source.value = 'blank';
    selectedFile.value = null;
    fileError.value = '';
}

/**
 * Снимает выбранный шаблон вместе с прочитанным содержимым и набором устройств,
 * который он принёс.
 *
 * Поколение растёт здесь же: снятие обязано отсечь ещё летящее чтение
 * содержимого — иначе оно доехало бы и вернуло источник к шаблону, которого
 * человек уже не выбирает.
 *
 * Набор устройств сбрасывается только если его принёс источник: правку из группы
 * «Устройства» смена источника стирать не вправе.
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

/**
 * Открывает диалог выбора JSON-файла.
 */
function handlePickFile(): void {
    fileError.value = '';
    openFilePicker();
}

/**
 * Разбирает выбранный файл и делает его источником содержимого.
 *
 * Ошибка разбора оставляет выбор на пустой странице и не блокирует создание:
 * пользователь либо возьмёт другой файл, либо создаст чистый холст.
 *
 * Исход применяется только к тому открытию модалки, в котором файл выбрали:
 * чтение большого файла переживает закрытие, и без этой сверки завершившийся
 * разбор подставил бы файл прошлой сессии в форму уже новой страницы.
 */
async function handleFileSelect(): Promise<void> {
    const startedIn = formGeneration;
    const result = await readSelectedFile(fileInputRef.value);

    if (!result || startedIn !== formGeneration) {
        return;
    }

    if (result.status === 'error') {
        // Битый файл возвращает источник к пустой странице — вместе с шаблоном,
        // если он был выбран: иначе форма показывала бы его строку, считала
        // активной пустую страницу и создала бы пустую схему, но с набором
        // устройств шаблона
        clearTemplateSelection();
        fileError.value = result.message;
        source.value = 'blank';
        selectedFile.value = null;
        return;
    }

    // Файл вытесняет шаблон целиком: источник один, и оставленное содержимое
    // шаблона уехало бы в страницу своим оформлением
    clearTemplateSelection();
    fileError.value = '';
    selectedFile.value = result.file;
    source.value = 'file';

    // Конверт несёт набор устройств — берём его: ключи `props.responsive` в
    // импортируемой схеме относятся именно к нему. Файл, который про набор
    // ничего не говорит (legacy-схема или конверт без поля), оставляет
    // создаваемую страницу наследующей
    if (result.file.viewportConfig !== undefined) {
        viewportConfig.value = result.file.viewportConfig;
        isViewportConfigFromSource.value = true;
    }
}

/**
 * Открывает выбор шаблона и запускает чтение списка, если он ещё не прочитан.
 */
function handlePickTemplate(): void {
    fileError.value = '';
    isTemplatePickerOpen.value = true;
    ensureTemplates();
}

/**
 * Закрывает выбор шаблона, не меняя источник.
 */
function handleCloseTemplatePicker(): void {
    isTemplatePickerOpen.value = false;
}

/**
 * Принимает выбранный шаблон: читает его содержимое и делает источником.
 *
 * Содержимое читается здесь, а не при сабмите: из него берутся набор устройств и
 * оформление, и человек должен увидеть их в форме до создания страницы. Отказ
 * чтения возвращает источник к пустой странице — создать её всё ещё можно.
 *
 * @param template - Сводка выбранного шаблона.
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
        // Набор устройств шаблона — то, в чём его страницу собирали: ключи
        // `props.responsive` схемы относятся именно к нему. `null` в шаблоне —
        // законное «наследует набор проекта»
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
        // Набор прошлой создаваемой страницы не должен доехать до следующей
        viewportConfig.value = null;
        isViewportConfigFromSource.value = false;
        // Источник, шаблон и его содержимое сбрасываются здесь же
        handleSelectBlank();

        // Форму могли открыть карточкой шаблона — тогда источник выбран заранее.
        // Промис намеренно не ожидается: фокус в поле названия обязан встать
        // сразу, а не после чтения содержимого шаблона
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
                    <span v-if="urlHint" :class="$style.fieldHint">{{ urlHint }}</span>
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

                <div :class="$style.advanced">
                    <button
                        :class="$style.advancedToggle"
                        type="button"
                        @click="handleToggleAdvanced"
                    >
                        <BricksIcon
                            icon="ta:outline-chevron-right"
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
                                :error-message="errors.urlPrefix"
                                @update:value="(val: string) => (urlPrefix = val)"
                            />
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
                                :error-message="errors.subdomain"
                                @update:value="(val: string) => (subdomain = val)"
                            />
                            <span :class="$style.fieldHint">
                                {{ t('bricks.publish.subdomainHint') }}
                            </span>
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
                            <!--
                                Предупреждение до сабмита, а не тост после: пока
                                страница не создана, набор ещё можно поправить
                            -->
                            <span v-if="orphanDeviceKeys.length > 0" :class="$style.devicesOrphans">
                                {{
                                    t('bricks.devices.orphanKeys', {
                                        keys: orphanDeviceKeys.join(', '),
                                    })
                                }}
                            </span>
                        </div>
                    </div>
                </div>

                <BricksFieldError :message="generalError" />
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
                <!--
                    Пока содержимое шаблона читается, создавать нечего: сабмит
                    ушёл бы с пустой схемой и создал бы чистую страницу вместо
                    выбранного шаблона
                -->
                <BricksButton
                    size="md"
                    variant="primary"
                    :disabled="isSubmitting || isTemplateLoading"
                    @click="submitForm"
                >
                    {{ t('bricks.publish.dashboard.createModal.submit') }}
                </BricksButton>
            </div>
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

    <!--
        Выбор шаблона — вложенное окно поверх формы: список открывается по клику на
        карточке «Из шаблона», как диалог файла у карточки «Из JSON-файла», и
        закрывается выбором
    -->
    <BricksModal
        :is-open="isTemplatePickerOpen"
        :title="t('bricks.templates.picker.title')"
        variant="gradient"
        padded
        layer="nested"
        @close="handleCloseTemplatePicker"
    >
        <div :class="$style.picker">
            <div :class="$style.header">
                <h3 :class="$style.title">{{ t('bricks.templates.picker.title') }}</h3>
                <BricksCloseButton @click="handleCloseTemplatePicker" />
            </div>

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

.fieldHint {
    font-size: 1.2rem;
    color: var(--bricks-base-400);
}

// Подпись над редактором тегов: своего лейбла у него нет — он общий элемент
// кита и в свойствах блоков подписывается снаружи
.fieldLabel {
    display: flex;
    align-items: center;
    justify-content: space-between;

    // 0.6rem gap колонки + 0.2rem = 0.8rem, как отступ лейбла внутри полей кита
    margin-bottom: 0.2rem;
    font-size: 1.4rem;
    font-weight: 500;
    color: var(--bricks-base-600);
}

.charCount {
    flex-shrink: 0;
    font-size: 1.2rem;
    font-weight: 400;
    color: var(--bricks-base-400);
}

.hiddenInput {
    position: absolute;
    overflow: hidden;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
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
    transition: color var(--bricks-default-transition);
    cursor: pointer;
    gap: 0.6rem;

    &:hover {
        color: var(--bricks-base-900);
    }
}

.advancedCaret {
    width: 1.2rem;
    height: 1.2rem;
    transition: transform var(--bricks-default-transition);
}

.advancedCaretOpen {
    transform: rotate(90deg);
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

    // Глифы 1.8rem по макету: без явного размера они наследуют кегль текста
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

.footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.8rem;
    padding: 1.6rem 2.4rem 2rem;
}

.picker {
    overflow: hidden;
    display: flex;
    width: 100%;

    // По ширине содержимого формы создания: список тех же шаблонов, что встанут
    // строкой под её карточками
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
