<script setup lang="ts">
// #region Imports
// Types
import type { TPublishFormState } from '../../../../common/types/bricks-api';
import type { IMediaItem } from '../../../../common/types/media';
import type { IBrickDemoValues } from '../../../../common/types/index';
import type { BricksSchema } from '../../../../common/types/brick';

// Vue
import { computed, onMounted } from 'vue';

// Vee-validate
import { Form, Field } from 'vee-validate';

// Composables
import { useBricksConfig } from '../../../../common/composables/useBricksConfig';
import { usePublishValidationSchema } from '../composables/usePublishValidationSchema';

// Pinia
import { usePublishStore } from '../../../publish/stores/publish';

// Components
import BricksInput from '../../../../ui/inputs/BricksInput.vue';
import BricksHexInput from '../../../../ui/inputs/BricksHexInput.vue';
import BricksSelect from '../../../../ui/inputs/BricksSelect.vue';
import BricksCloseButton from '../../../../ui/base/modal/BricksCloseButton.vue';
import BuilderShellSidebarNavigationEditor from './BuilderShellSidebarNavigationEditor.vue';
import BuilderShellSidebarPublishSchemaActions from './BuilderShellSidebarPublishSchemaActions.vue';
import BuilderShellSidebarPublishSocialImage from './BuilderShellSidebarPublishSocialImage.vue';
// #endregion

// #region Emits
const emit = defineEmits<{
    close: [];
    openMediaGallery: [];
    importSchema: [schema: BricksSchema];
}>();
// #endregion

// #region Data
const publishStore = usePublishStore();
const bricksConfig = useBricksConfig();
const isEditing = computed<boolean>(() => publishStore.editingPageId !== null);

// Validation schema
const { validationSchema } = usePublishValidationSchema(isEditing.value);
// #endregion

// #region Computed
const settings = computed(() => publishStore.currentFormState);
const isSubmitting = computed(() => publishStore.isSubmitting);
const defaultBackgroundColor = computed<string>(() => bricksConfig.backgroundColor || '#FFFFFF');
const defaultLayout = computed<string>(() => 'default');
const initialValues = computed(() => ({
    pagename: settings.value.pagename || '',
    title: settings.value.title || '',
    description: settings.value.description || '',
}));
/**
 * Ключ формы должен меняться ТОЛЬКО при смене страницы (editingPageId),
 * НЕ при изменении полей формы. Иначе форма перерендерится и потеряет фокус.
 */
const formKey = computed(() => {
    const base = publishStore.editingPageId ?? 'new';
    return `form-${base}`;
});
const layoutOptions = computed(() => {
    const baseOptions = ['default', 'bricks'];
    const customLayouts = bricksConfig.layouts || [];
    const unique = Array.from(new Set([...baseOptions, ...customLayouts].filter(Boolean)));

    return unique.map((value) => ({
        label: String(value),
        value: String(value),
    }));
});
const layoutFacets = computed(() => layoutOptions.value.map((option) => option.value));

const panelTitle = computed<string>(() =>
    isEditing.value ? 'Изменить настройки страницы' : 'Настройки страницы'
);
const fullUrlPreview = computed<string>(() => {
    const pagename = settings.value.pagename?.trim();
    if (!pagename) {
        return '';
    }
    const prefix = settings.value.urlPrefix?.trim();
    const subdomain = settings.value.subdomain?.trim();
    const path = prefix ? `/${prefix}/${pagename}` : `/${pagename}`;
    return subdomain ? `${subdomain}.[домен]${path}` : path;
});
// #endregion

// #region Methods
/**
 * Emits close event for parent handler.
 */
function handleClose(): void {
    emit('close');
}

/**
 * Обновляет поле настроек публикации в сторе.
 * Валидация теперь управляется vee-validate автоматически.
 *
 * @param field - имя поля настроек.
 * @param value - новое значение поля.
 */
function handleUpdateField<K extends keyof TPublishFormState>(
    field: K,
    value: TPublishFormState[K]
): void {
    publishStore.setCurrentFormField(field, value);
    publishStore.clearValidationError(field);
}

/**
 * Открывает медиагалерею для выбора social image.
 */
function handleOpenMediaGallery(): void {
    emit('openMediaGallery');
}

/**
 * Обрабатывает выбранный элемент медиагалереи.
 *
 * @param item - выбранный медиа-объект.
 */
function handleMediaSelect(item: IMediaItem): void {
    handleUpdateField('socialImage', item.url);
}

/**
 * Сбрасывает выбранное social image.
 */
function handleClearSocialImage(): void {
    handleUpdateField('socialImage', '');
}

/**
 * Обновляет выбранный layout страницы.
 *
 * @param value - выбранное значение layout.
 */
function handleLayoutChange(value: IBrickDemoValues) {
    const nextLayout =
        typeof value === 'string' && value ? value : settings.value.layout || defaultLayout.value;
    handleUpdateField('layout', nextLayout);
}

/**
 * Пробрасывает импортированную схему наверх (загрузка без сохранения).
 *
 * @param schema - Провалидированная схема из JSON-файла.
 */
function handleImportSchema(schema: BricksSchema): void {
    emit('importSchema', schema);
}

defineExpose({
    handleMediaSelect,
});
// #endregion

// #region Lifecycle
onMounted(() => {
    if (!settings.value.backgroundColor) {
        handleUpdateField('backgroundColor', defaultBackgroundColor.value);
    }
    if (!settings.value.layout) {
        handleUpdateField('layout', defaultLayout.value);
    }
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
            :class="[$style.content, 'scrollbox']"
            :validation-schema="validationSchema"
            :initial-values="initialValues"
        >
            <Transition mode="out-in" name="library-fade-fast">
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
                <span :class="$style.hint"
                    >Опционально. Страница будет доступна по /prefix/pagename</span
                >
            </div>

            <div :class="$style.formGroup">
                <BricksInput
                    label="Субдомен"
                    :value="settings.subdomain"
                    type="text"
                    placeholder="spb"
                    :max-length="63"
                    :disabled="isSubmitting"
                    @update:value="(val: string) => handleUpdateField('subdomain', val || null)"
                />
                <span :class="$style.hint"
                    >Опционально. Страница будет доступна только на этом поддомене</span
                >
            </div>

            <Transition mode="out-in" name="library-fade-fast">
                <div v-if="fullUrlPreview" :class="$style.urlPreview">
                    {{ fullUrlPreview }}
                </div>
            </Transition>

            <Field v-slot="{ field, errorMessage }" name="title">
                <div :class="$style.formGroup">
                    <BricksInput
                        label="Название *"
                        :value="field.value"
                        type="text"
                        :required="true"
                        :max-length="120"
                        placeholder="Заголовок страницы"
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
                    <label :class="$style.label">
                        Meta Description *
                        <span :class="$style.charCount"
                            >{{ settings?.description?.length ?? 0 }}/500</span
                        >
                    </label>

                    <textarea
                        :value="field.value"
                        :class="[
                            $style.textarea,
                            {
                                [$style.inputError]:
                                    errorMessage || publishStore.validationErrors.description,
                            },
                        ]"
                        :disabled="isSubmitting"
                        :maxlength="500"
                        placeholder="SEO Description"
                        rows="3"
                        @input="
                            (e) => {
                                const target = e.target as HTMLTextAreaElement;
                                field.onChange(target.value);
                                handleUpdateField('description', target.value);
                            }
                        "
                        @blur="field.onBlur"
                    ></textarea>

                    <Transition mode="out-in" name="library-fade-fast">
                        <div
                            v-if="errorMessage || publishStore.validationErrors.description"
                            :class="$style.error"
                        >
                            {{ errorMessage || publishStore.validationErrors.description }}
                        </div>
                    </Transition>
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
                <label :class="$style.label">Цвет фона</label>
                <BricksHexInput
                    :value="settings.backgroundColor || defaultBackgroundColor"
                    :disabled="isSubmitting"
                    @update:value="(val: string) => handleUpdateField('backgroundColor', val)"
                />
            </div>

            <div :class="$style.formGroup">
                <BuilderShellSidebarNavigationEditor />
            </div>

            <div :class="$style.divider" />

            <div :class="$style.formGroup">
                <label :class="$style.label">Схема страницы</label>
                <BuilderShellSidebarPublishSchemaActions
                    :is-submitting="isSubmitting"
                    @import-schema="handleImportSchema"
                />
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

.charCount {
    margin-left: auto;
    font-size: 1.2rem;
    font-weight: 400;
    color: var(--bricks-base-400);
}

.textarea {
    /* Фиксируем светлую тему для области ввода контента */
    --bricks-base-0: #fff;
    --bricks-base-300: #d1d5db;
    --bricks-base-900: #111827;

    width: 100%;
    min-height: 8rem;
    padding: 1.2rem;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--bricks-base-300);
    background-color: var(--bricks-base-0);
    font-size: 1.4rem;
    color: var(--bricks-base-900);
    transition: border-color 150ms ease;
    resize: vertical;

    &:focus {
        border-color: var(--bricks-base-300);
    }

    &:disabled {
        background-color: var(--bricks-base-300);
        color: var(--bricks-base-400);
    }
}

.inputError {
    border-color: var(--bricks-danger-500);
}

.hint {
    margin-top: 0.4rem;
    font-size: 1.2rem;
    color: var(--bricks-base-400);
}

.urlPreview {
    margin-bottom: 1.6rem;
    padding: 0.8rem 1.2rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--bricks-base-50);
    font-family: monospace;
    font-size: 1.2rem;
    color: var(--bricks-base-600);
    word-break: break-all;
}

.error {
    margin-top: 0.4rem;
    font-size: 1.2rem;
    color: var(--bricks-danger-500);
}

.generalError {
    margin-bottom: 1.6rem;
    padding: 1rem 1.2rem;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--bricks-danger-500);
    background-color: rgb(239 68 68 / 10%);
    font-size: 1.3rem;
    color: var(--bricks-danger-500);
}

.divider {
    margin: 0.8rem 0 1.6rem;
    border-top: 1px solid var(--bricks-base-200);
}
</style>
