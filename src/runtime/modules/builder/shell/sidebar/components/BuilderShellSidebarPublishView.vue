<script setup lang="ts">
// #region Imports
// Types
import type { TPublishFormErrors } from '../../../publish/types/dashboard';

// Vue
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Vee-validate
import { Form } from 'vee-validate';

// Composables
import { useSidebarPublishForm } from '../composables/useSidebarPublishForm';

// Pinia
import { usePublishStore } from '../../../publish/stores/publish';

// Components
import BricksInput from '../../../../ui/inputs/BricksInput.vue';
import BricksHexInput from '../../../../ui/inputs/BricksHexInput.vue';
import BricksSelect from '../../../../ui/inputs/BricksSelect.vue';
import BricksCloseButton from '../../../../ui/base/modal/BricksCloseButton.vue';
import BuilderPublishSeoFields from '../../../publish/components/BuilderPublishSeoFields.vue';
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

/**
 * Поля, которых пользователь уже касался.
 *
 * Схема валидируется формой сразу при монтировании и наполняет `errors` по всем
 * своим путям — у новой страницы это значит красные «обязательно» ещё до первого
 * клика. Раньше от этого спасали обёртки `<Field>`: они держали ошибку в своей
 * области и до взаимодействия её не показывали. Обёрток больше нет, поэтому
 * отметку «поле трогали» ведём сами.
 */
const touchedFields = ref<Set<string>>(new Set());
// #endregion

// #region Methods
/**
 * Ошибка одного поля из двух источников: живой yup-схемы формы (только по
 * тронутым полям) и проверки перед публикацией, которая пишет в стор. Второй
 * источник показывается всегда: он появляется по явному действию пользователя и
 * переживает уход с поля.
 *
 * @param formErrors - Ошибки vee-validate текущей формы.
 * @param field - Имя поля формы.
 * @returns Текст ошибки либо undefined.
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
 * Сводит ошибки SEO-полей для общего компонента SEO.
 *
 * @param formErrors - Ошибки vee-validate текущей формы.
 * @returns Ошибки по полям.
 */
function mergeSeoErrors(formErrors: Record<string, string | undefined>): TPublishFormErrors {
    return {
        title: fieldError(formErrors, 'title'),
        pagename: fieldError(formErrors, 'pagename'),
        description: fieldError(formErrors, 'description'),
        keywords: fieldError(formErrors, 'keywords'),
    };
}

/**
 * Пишет значение SEO-поля и в стор (источник правды сайдбара), и в форму
 * vee-validate — иначе схема проверяла бы прежнее значение.
 *
 * @param setFieldValue - Сеттер значения формы из слота `<Form>`.
 * @param field - Имя поля.
 * @param value - Новое значение.
 */
function handleSeoFieldUpdate(
    setFieldValue: (field: string, value: string) => void,
    field: 'title' | 'pagename' | 'description' | 'keywords',
    value: string
): void {
    if (!touchedFields.value.has(field)) {
        touchedFields.value = new Set(touchedFields.value).add(field);
    }

    setFieldValue(field, value);
    handleUpdateField(field, value);
}

/**
 * Пишет routing-поле в форму и в стор. В сторе пустая строка нормализуется в
 * null (так поле уезжает в payload), схеме же нужна строка — она сама приводит
 * пустое значение к null.
 *
 * @param setFieldValue - Сеттер значения формы из слота `<Form>`.
 * @param field - Имя поля.
 * @param value - Новое значение.
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

// #region Lifecycle
// Смена страницы пересобирает форму (`formKey`) — отметки «поле трогали» от
// прошлой страницы вместе с ней должны уйти, иначе чужие ошибки покажутся сразу
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

            <!--
                Значения приходят из стора, а не из формы: источник правды сайдбара —
                `currentFormState`, форма же держит только валидацию. Поэтому каждое
                изменение пишется в оба места — иначе схема проверяла бы прошлый ввод
            -->
            <BuilderPublishSeoFields
                :class="$style.seoFields"
                :title="settings.title || ''"
                :pagename="settings.pagename || ''"
                :description="settings.description || ''"
                :keywords="settings.keywords || ''"
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
            >
                <template #address>
                    <div :class="$style.addressFields">
                        <div :class="$style.addressField">
                            <BricksInput
                                label="URL Prefix"
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
                            <span :class="$style.hint">{{
                                t('bricks.publish.urlPrefixHint')
                            }}</span>
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
                            <span :class="$style.hint">{{
                                t('bricks.publish.subdomainHint')
                            }}</span>
                        </div>

                        <Transition mode="out-in" name="bricks-fade-fast">
                            <div v-if="fullUrlPreview" :class="$style.urlPreview">
                                {{ fullUrlPreview }}
                            </div>
                        </Transition>
                    </div>
                </template>
            </BuilderPublishSeoFields>

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

.seoFields {
    margin-bottom: 1.6rem;
}

// Префикс, поддомен и превью полного URL — продолжение поля адреса, поэтому
// живут в слоте общего компонента и держат его же шаг между полями
.addressFields {
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
}

.addressField {
    display: flex;
    flex-direction: column;
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
