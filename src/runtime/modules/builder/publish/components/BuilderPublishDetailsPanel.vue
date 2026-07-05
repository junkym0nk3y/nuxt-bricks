<script setup lang="ts">
// #region Imports
// Types
import type { IMediaItem } from '../../../common/types/media';
import type { IPublishDetailsPanelProps, IPublishDetailsPanelEmits } from '../types/dashboard';

// Utils
import { formatPageDate } from '../utils/dates';

// Vue
import { ref, computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { usePublishPageForm } from '../composables/usePublishPageForm';

// Components
import BricksInput from '../../../ui/inputs/BricksInput.vue';
import BricksSwitch from '../../../ui/inputs/BricksSwitch.vue';
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksCloseButton from '../../../ui/base/modal/BricksCloseButton.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IPublishDetailsPanelProps>(), {
    isDuplicating: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IPublishDetailsPanelEmits>();
// #endregion

// #region Data
const { t } = useI18n();

const {
    title,
    pagename,
    description,
    keywords,
    socialImage,
    urlPrefix,
    subdomain,
    errors,
    isDirty,
    isSaving,
    submitForm,
    resetToPage,
    setSocialImage,
} = usePublishPageForm(
    computed(() => props.page),
    {
        onSaveSuccess: () =>
            emit('notify', t('bricks.publish.dashboard.details.toasts.saved'), 'success'),
        onSaveError: (message) =>
            emit(
                'notify',
                message || t('bricks.publish.dashboard.details.toasts.saveFailed'),
                'error'
            ),
    }
);

const isRoutingOpen = ref(false);
const host = ref('');
// #endregion

// #region Computed
const panelSubtitle = computed<string>(() => {
    const created = t('bricks.publish.dashboard.details.created', {
        date: formatPageDate(props.page.createdAt),
    });
    return `/${props.page.pagename} · ${created}`;
});

/**
 * Live-URL страницы от текущих значений формы (pagename/urlPrefix/subdomain).
 */
const liveUrl = computed<string>(() => {
    const slug = String(pagename.value ?? '').trim();
    if (!slug) {
        return '';
    }
    const prefix = String(urlPrefix.value ?? '').trim();
    const sub = String(subdomain.value ?? '').trim();
    const path = prefix ? `/${prefix}/${slug}` : `/${slug}`;
    const domain = host.value || t('bricks.publish.domainStub');
    return sub ? `${sub}.${domain}${path}` : `${domain}${path}`;
});

const descriptionLength = computed<number>(() => String(description.value ?? '').length);
// #endregion

// #region Methods
/**
 * Закрывает панель деталей.
 */
function handleClose(): void {
    emit('close');
}

/**
 * Переключает статус публикации (оптимистичный patch — в контроллере).
 *
 * @param value - Новый флаг публикации.
 */
function handleTogglePublished(value: boolean | string): void {
    emit('toggle-published', props.page, Boolean(value));
}

/**
 * Копирует live-URL страницы в буфер обмена.
 */
async function handleCopyUrl(): Promise<void> {
    try {
        await navigator.clipboard.writeText(`https://${liveUrl.value}`);
        emit('notify', t('bricks.publish.dashboard.details.toasts.urlCopied'), 'success');
    } catch {
        emit('notify', t('bricks.publish.dashboard.details.toasts.copyFailed'), 'error');
    }
}

/**
 * Обновляет описание из textarea.
 *
 * @param event - Событие ввода.
 */
function onDescriptionInput(event: Event): void {
    description.value = (event.target as HTMLTextAreaElement).value;
}

/**
 * Запрашивает выбор OG-изображения из медиа-галереи.
 */
function handleOpenMediaGallery(): void {
    emit('open-media');
}

/**
 * Принимает выбранный в медиа-галерее элемент (вызывается контроллером через ref).
 *
 * @param item - Выбранный медиа-объект.
 */
function handleMediaSelect(item: IMediaItem): void {
    setSocialImage(item.url);
}

/**
 * Сбрасывает выбранное OG-изображение.
 */
function handleClearSocialImage(): void {
    setSocialImage('');
}

/**
 * Разворачивает/сворачивает секцию маршрутизации.
 */
function handleToggleRouting(): void {
    isRoutingOpen.value = !isRoutingOpen.value;
}

/**
 * Открывает страницу в редакторе билдера.
 */
function handleEdit(): void {
    emit('edit', props.page);
}

/**
 * Дублирует страницу.
 */
function handleDuplicate(): void {
    emit('duplicate', props.page);
}

/**
 * Запрашивает удаление страницы.
 */
function handleDelete(): void {
    emit('delete', props.page);
}

defineExpose({
    handleMediaSelect,
});
// #endregion

// #region Lifecycle
watch(
    () => props.page.id,
    () => {
        isRoutingOpen.value = Boolean(props.page.urlPrefix || props.page.subdomain);
    },
    { immediate: true }
);

onMounted(() => {
    host.value = window.location.host;
});
// #endregion
</script>

<template>
    <div :class="$style.BuilderPublishDetailsPanel">
        <div :class="$style.header">
            <div :class="$style.titleRow">
                <h2 :class="$style.title">{{ props.page.title || props.page.pagename }}</h2>
                <BricksCloseButton @click="handleClose" />
            </div>
            <p :class="$style.subtitle">{{ panelSubtitle }}</p>
        </div>

        <div :class="[$style.content, 'scrollbox']">
            <div :class="$style.publication">
                <BricksSwitch
                    :value="props.page.published"
                    :true-value="true"
                    :false-value="false"
                    false-label=""
                    :true-label="t('bricks.publish.dashboard.details.published')"
                    @update:value="handleTogglePublished"
                />
                <div v-if="liveUrl" :class="$style.urlRow">
                    <BricksIcon icon="ph:link" :class="$style.urlIcon" />
                    <span :class="$style.urlText">{{ liveUrl }}</span>
                    <button
                        :class="$style.copyButton"
                        type="button"
                        :title="t('bricks.publish.dashboard.details.copyUrl')"
                        :aria-label="t('bricks.publish.dashboard.details.copyUrl')"
                        @click="handleCopyUrl"
                    >
                        <BricksIcon icon="ta:outline-copy" />
                    </button>
                </div>
            </div>

            <span :class="$style.sectionLabel">
                {{ t('bricks.publish.dashboard.details.seoMeta') }}
            </span>

            <div :class="$style.field">
                <BricksInput
                    :label="t('bricks.publish.dashboard.details.titleLabel')"
                    :value="title"
                    type="text"
                    :max-length="120"
                    :placeholder="t('bricks.publish.titlePlaceholder')"
                    :disabled="isSaving"
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
                    :disabled="isSaving"
                    @update:value="(val: string) => (pagename = val)"
                />
                <span v-if="errors.pagename" :class="$style.fieldError">
                    {{ errors.pagename }}
                </span>
            </div>

            <div :class="$style.field">
                <label :class="$style.fieldLabel">
                    {{ t('bricks.publish.dashboard.details.descriptionLabel') }}
                    <span :class="$style.charCount">{{ descriptionLength }}/500</span>
                </label>
                <textarea
                    :value="String(description ?? '')"
                    :class="[$style.textarea, errors.description && $style.textareaError]"
                    :disabled="isSaving"
                    :maxlength="500"
                    rows="3"
                    placeholder="SEO Description"
                    @input="onDescriptionInput"
                ></textarea>
                <span v-if="errors.description" :class="$style.fieldError">
                    {{ errors.description }}
                </span>
            </div>

            <div :class="$style.field">
                <BricksInput
                    :label="t('bricks.publish.dashboard.details.keywordsLabel')"
                    :value="keywords"
                    type="text"
                    :max-length="255"
                    placeholder="promo, page, marketing"
                    :disabled="isSaving"
                    @update:value="(val: string) => (keywords = val)"
                />
                <span v-if="errors.keywords" :class="$style.fieldError">
                    {{ errors.keywords }}
                </span>
            </div>

            <div :class="$style.field">
                <label :class="$style.fieldLabel">
                    {{ t('bricks.publish.dashboard.details.ogImage') }}
                </label>
                <div :class="$style.ogRow">
                    <span :class="$style.ogThumb">
                        <img
                            v-if="socialImage"
                            :src="String(socialImage)"
                            alt=""
                            :class="$style.ogImage"
                        />
                        <BricksIcon v-else icon="ta:outline-photo" :class="$style.ogPlaceholder" />
                    </span>
                    <BricksButton
                        size="sm"
                        variant="secondary"
                        :disabled="isSaving"
                        @click="handleOpenMediaGallery"
                    >
                        {{ t('bricks.publish.dashboard.details.selectFromMedia') }}
                    </BricksButton>
                    <BricksButton
                        v-if="socialImage"
                        size="sm"
                        variant="ghost"
                        :disabled="isSaving"
                        @click="handleClearSocialImage"
                    >
                        {{ t('bricks.publish.socialImageClear') }}
                    </BricksButton>
                </div>
                <span v-if="errors.socialImage" :class="$style.fieldError">
                    {{ errors.socialImage }}
                </span>
            </div>

            <div :class="$style.routing">
                <button :class="$style.routingToggle" type="button" @click="handleToggleRouting">
                    <BricksIcon
                        icon="ta:outline-chevron-right"
                        :class="[$style.routingCaret, isRoutingOpen && $style.routingCaretOpen]"
                    />
                    {{ t('bricks.publish.dashboard.details.routing') }}
                </button>

                <div v-if="isRoutingOpen" :class="$style.routingFields">
                    <div :class="$style.field">
                        <BricksInput
                            label="URL Prefix"
                            :value="urlPrefix"
                            type="text"
                            :max-length="100"
                            placeholder="blog"
                            :disabled="isSaving"
                            @update:value="(val: string) => (urlPrefix = val)"
                        />
                        <span v-if="errors.urlPrefix" :class="$style.fieldError">
                            {{ errors.urlPrefix }}
                        </span>
                        <span :class="$style.fieldHint">{{
                            t('bricks.publish.urlPrefixHint')
                        }}</span>
                    </div>
                    <div :class="$style.field">
                        <BricksInput
                            :label="t('bricks.publish.subdomain')"
                            :value="subdomain"
                            type="text"
                            :max-length="63"
                            placeholder="spb"
                            :disabled="isSaving"
                            @update:value="(val: string) => (subdomain = val)"
                        />
                        <span v-if="errors.subdomain" :class="$style.fieldError">
                            {{ errors.subdomain }}
                        </span>
                        <span :class="$style.fieldHint">{{
                            t('bricks.publish.subdomainHint')
                        }}</span>
                    </div>
                </div>
            </div>

            <div v-if="isDirty || isSaving" :class="$style.saveBar">
                <BricksButton
                    size="md"
                    variant="primary"
                    block
                    :disabled="isSaving"
                    @click="submitForm"
                >
                    {{ t('bricks.publish.dashboard.details.save') }}
                </BricksButton>
                <BricksButton size="md" variant="ghost" :disabled="isSaving" @click="resetToPage">
                    {{ t('bricks.publish.dashboard.details.cancel') }}
                </BricksButton>
            </div>
        </div>

        <div :class="$style.footer">
            <BricksButton
                size="md"
                variant="primary"
                block
                :disabled="isSaving"
                @click="handleEdit"
            >
                {{ t('bricks.publish.dashboard.details.openInEditor') }}
            </BricksButton>
            <div :class="$style.footerRow">
                <BricksButton
                    :class="$style.duplicateButton"
                    size="md"
                    variant="secondary"
                    :disabled="props.isDuplicating || isSaving"
                    @click="handleDuplicate"
                >
                    {{ t('bricks.publish.dashboard.row.duplicate') }}
                </BricksButton>
                <button
                    :class="$style.deleteButton"
                    type="button"
                    :title="t('bricks.publish.dashboard.row.delete')"
                    :aria-label="t('bricks.publish.dashboard.row.delete')"
                    @click="handleDelete"
                >
                    <BricksIcon icon="ta:outline-trash" />
                </button>
            </div>
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderPublishDetailsPanel {
    display: flex;
    flex-direction: column;
    height: 100%;
}

.header {
    display: flex;
    flex-shrink: 0;
    flex-direction: column;
    gap: 0.2rem;
    padding: 1.8rem 2rem 1.6rem;
    border-bottom: 1px solid var(--bricks-base-200);
}

.titleRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
}

.title {
    overflow: hidden;
    margin: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.6rem;
    font-weight: 600;
    color: var(--bricks-base-900);
}

.subtitle {
    overflow: hidden;
    margin: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.2rem;
    color: var(--bricks-base-400);
}

.content {
    overflow-y: auto;
    display: flex;
    flex: 1;
    padding: 1.6rem 2rem;
    flex-direction: column;
    gap: 1.6rem;
}

.publication {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.2rem;
    border-radius: var(--border-radius-sm);
    background: var(--bricks-base-50);
}

.urlRow {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 0;
}

.urlIcon {
    flex-shrink: 0;
    width: 1.4rem;
    height: 1.4rem;
    color: var(--bricks-base-400);
}

.urlText {
    overflow: hidden;
    flex: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--bricks-primary-600);
}

.copyButton {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: none;
    background: transparent;
    font-size: 1.4rem;
    color: var(--bricks-base-400);
    transition: color var(--default-transition);
    cursor: pointer;

    &:hover {
        color: var(--bricks-base-900);
    }
}

.sectionLabel {
    text-transform: uppercase;
    font-size: 1.2rem;
    font-weight: 600;
    letter-spacing: 0.06rem;
    color: var(--bricks-base-400);
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
    font-size: 1.4rem;
    font-weight: 500;
    color: var(--bricks-base-600);
}

.charCount {
    font-size: 1.2rem;
    font-weight: 400;
    color: var(--bricks-base-400);
}

.textarea {
    box-sizing: border-box;
    width: 100%;
    min-height: 8.4rem;
    padding: 0.8rem 1.2rem;
    border-radius: var(--border-radius-xs);
    border: 1px solid var(--bricks-base-300);
    background-color: var(--bricks-base-0);
    outline: none;
    font-size: 1.4rem;
    color: var(--bricks-base-900);
    transition:
        border-color var(--default-transition),
        box-shadow var(--default-transition);
    resize: vertical;

    &::placeholder {
        color: var(--bricks-base-400);
    }

    &:hover {
        border-color: var(--bricks-base-400);
    }

    &:focus {
        border-color: var(--bricks-primary);
        box-shadow: var(--shadow-focus);
    }

    &:disabled {
        background-color: var(--bricks-base-50);
        color: var(--bricks-base-400);
    }
}

.textareaError {
    border-color: var(--bricks-danger-500);
}

.fieldError {
    font-size: 1.2rem;
    color: var(--bricks-danger-500);
}

.fieldHint {
    font-size: 1.2rem;
    color: var(--bricks-base-400);
}

.ogRow {
    display: flex;
    align-items: center;
    gap: 1rem;
}

.ogThumb {
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 4.4rem;
    height: 4.4rem;
    border-radius: var(--border-radius-xs);
    background: var(--bricks-base-100);
}

.ogImage {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.ogPlaceholder {
    width: 1.8rem;
    height: 1.8rem;
    color: var(--bricks-base-400);
}

.routing {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
}

.routingToggle {
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

.routingCaret {
    width: 1.2rem;
    height: 1.2rem;
    transition: transform var(--default-transition);
}

.routingCaretOpen {
    transform: rotate(90deg);
}

.routingFields {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
}

.saveBar {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
}

.footer {
    display: flex;
    flex-shrink: 0;
    flex-direction: column;
    gap: 0.8rem;
    padding: 1.6rem 2rem 2rem;
    border-top: 1px solid var(--bricks-base-200);
}

.footerRow {
    display: flex;
    gap: 0.8rem;
}

.duplicateButton {
    flex: 1;
}

.deleteButton {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 3.6rem;
    height: 3.6rem;
    padding: 0;
    border-radius: var(--border-radius-xs);
    border: 1px solid var(--bricks-danger-500);
    background: var(--bricks-base-0);
    font-size: 1.6rem;
    color: var(--bricks-danger-500);
    transition:
        background-color var(--default-transition),
        color var(--default-transition);
    cursor: pointer;

    &:hover {
        background: var(--bricks-danger-50);
        color: var(--bricks-danger-600);
    }
}
</style>
