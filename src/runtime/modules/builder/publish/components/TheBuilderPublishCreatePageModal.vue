<script setup lang="ts">
// #region Imports
// Types
import type { IBricksSchema } from '../../../common/types/brick';
import type { IParsedSchemaFile } from '../types/composables';
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

// Constants
import { KEYWORDS_MAX_LENGTH } from '../../../common/constants/publish';

// Composables
import { usePublishCreatePageForm } from '../composables/usePublishCreatePageForm';
import { useSchemaFileTransfer } from '../composables/useSchemaFileTransfer';

// Components
import BricksInput from '../../../ui/inputs/BricksInput.vue';
import BricksTagsEditor from '../../../ui/inputs/BricksTagsEditor.vue';
import BricksFieldError from '../../../ui/inputs/BricksFieldError.vue';
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksCloseButton from '../../../ui/base/modal/BricksCloseButton.vue';
import BricksModal from '../../../ui/base/modal/BricksModal.vue';
import BuilderPublishCreatePageStartOptions from './BuilderPublishCreatePageStartOptions.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IPublishCreatePageModalProps>(), {});
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
    resolveSchema: resolveCreateSchema,
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
    const file = selectedFile.value;

    if (source.value !== 'file' || !file) {
        return { components: [] };
    }

    return await props.resolveImportedSchema(file.schema);
}

/**
 * Возвращает источник к пустой странице.
 */
function handleSelectBlank(): void {
    source.value = 'blank';
    selectedFile.value = null;
    fileError.value = '';
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
        fileError.value = result.message;
        source.value = 'blank';
        selectedFile.value = null;
        return;
    }

    fileError.value = '';
    selectedFile.value = result.file;
    source.value = 'file';
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
        handleSelectBlank();
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
                    :error="fileError"
                    :is-submitting="isSubmitting"
                    @select-blank="handleSelectBlank"
                    @pick-file="handlePickFile"
                    @clear-file="handleSelectBlank"
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
