<script setup lang="ts">
// #region Imports
// Types
import type { IPageVersionSummary, TPublishedPageSummary } from '../../../common/types/bricks-api';
import type { IMediaItem } from '../../../common/types/media';
import type { IParsedSchemaFile } from '../types/composables';
import type { IPublishDetailsPanelProps, IPublishDetailsPanelEmits } from '../types/dashboard';

// Utils
import { formatPageDate } from '../utils/dates';
import { toPageAddress } from '../../../common/utils/bricks/pageAddress';
import { getPublishedPagePath } from '../../../common/utils/bricks/routePaths';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { usePublishPageForm } from '../composables/usePublishPageForm';
import { usePublishDetailsUrl } from '../composables/usePublishDetailsUrl';

// Components
import BricksSwitch from '../../../ui/inputs/BricksSwitch.vue';
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksCloseButton from '../../../ui/base/modal/BricksCloseButton.vue';
import BuilderPublishSeoFields from './BuilderPublishSeoFields.vue';
import BuilderPublishDetailsPanelOgImage from './BuilderPublishDetailsPanelOgImage.vue';
import BuilderPublishDetailsPanelRouting from './BuilderPublishDetailsPanelRouting.vue';
import BuilderPublishDetailsPanelVersions from './BuilderPublishDetailsPanelVersions.vue';
import BuilderPublishDetailsPanelSchema from './BuilderPublishDetailsPanelSchema.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IPublishDetailsPanelProps>(), {
    isDuplicating: false,
    isImporting: false,
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

const { liveUrl, copyLiveUrl } = usePublishDetailsUrl({ pagename, urlPrefix, subdomain });
// #endregion

// #region Computed
const panelSubtitle = computed<string>(() => {
    const created = t('bricks.publish.dashboard.details.created', {
        date: formatPageDate(props.page.createdAt),
    });
    // Адрес целиком: подпись обязана называть ту же страницу, что открыта, а
    // `/post` у `/blog/post` и `/news/post` неразличим
    const path = getPublishedPagePath(toPageAddress(props.page.pagename, props.page.urlPrefix));

    return `${path} · ${created}`;
});
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
 * Копирует live-URL страницы в буфер обмена и показывает тост с результатом.
 */
async function handleCopyUrl(): Promise<void> {
    const copied = await copyLiveUrl();
    if (copied) {
        emit('notify', t('bricks.publish.dashboard.details.toasts.urlCopied'), 'success');
    } else {
        emit('notify', t('bricks.publish.dashboard.details.toasts.copyFailed'), 'error');
    }
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
 * Пробрасывает запрос отката к версии контроллеру (подтверждение и тосты — там).
 *
 * @param version - Сводка версии.
 */
function handleRestoreVersion(version: IPageVersionSummary): void {
    emit('restore-version', props.page, version);
}

/**
 * Пробрасывает уведомление секции версий контроллеру.
 *
 * @param message - Текст уведомления.
 * @param variant - Тип уведомления.
 */
function handleVersionsNotify(message: string, variant: 'success' | 'error'): void {
    emit('notify', message, variant);
}

/**
 * Пробрасывает разобранный файл схемы контроллеру: подтверждение замены,
 * резолвинг картинок и запись принадлежат ему.
 *
 * Страница берётся из события, а не из пропа: секция снимает её до чтения файла,
 * и к моменту эмита проп может указывать уже на другую страницу.
 *
 * @param page - Страница на момент выбора файла.
 * @param file - Разобранный JSON-файл схемы.
 */
function handleImportFile(page: TPublishedPageSummary, file: IParsedSchemaFile): void {
    emit('import-schema-file', page, file);
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

        <div :class="[$style.content, 'bricks-scrollbox']">
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

            <BuilderPublishSeoFields
                v-model:title="title"
                v-model:pagename="pagename"
                v-model:description="description"
                v-model:keywords="keywords"
                :errors="errors"
                :disabled="isSaving"
            />

            <BuilderPublishDetailsPanelOgImage
                :social-image="String(socialImage ?? '')"
                :error="errors.socialImage"
                :is-saving="isSaving"
                @open-media="handleOpenMediaGallery"
                @clear="handleClearSocialImage"
            />

            <BuilderPublishDetailsPanelRouting
                v-model:url-prefix="urlPrefix"
                v-model:subdomain="subdomain"
                :page="props.page"
                :errors="errors"
                :is-saving="isSaving"
            />

            <BuilderPublishDetailsPanelVersions
                :page="props.page"
                @restore="handleRestoreVersion"
                @notify="handleVersionsNotify"
            />

            <BuilderPublishDetailsPanelSchema
                :page="props.page"
                :is-importing="props.isImporting"
                :is-saving="isSaving"
                @import-file="handleImportFile"
            />

            <!--
                Сохранение meta заблокировано и на время импорта схемы: обе
                операции — PATCH с одним и тем же `expectedRevision`, и второй
                получил бы 409, заставив заново выбирать JSON-файл. Потери данных
                precondition не допускает, но конфликт здесь рукотворный
            -->
            <div v-if="isDirty || isSaving" :class="$style.saveBar">
                <BricksButton
                    size="md"
                    variant="primary"
                    block
                    :disabled="isSaving || props.isImporting"
                    @click="submitForm"
                >
                    {{ t('bricks.publish.dashboard.details.save') }}
                </BricksButton>
                <BricksButton
                    size="md"
                    variant="ghost"
                    :disabled="isSaving || props.isImporting"
                    @click="resetToPage"
                >
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
    border-radius: var(--bricks-border-radius-sm);
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
    transition: color var(--bricks-default-transition);
    cursor: pointer;

    &:hover {
        color: var(--bricks-base-900);
    }
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
    border-radius: var(--bricks-border-radius-xs);
    border: 1px solid var(--bricks-danger-500);
    background: var(--bricks-base-0);
    font-size: 1.6rem;
    color: var(--bricks-danger-500);
    transition:
        background-color var(--bricks-default-transition),
        color var(--bricks-default-transition);
    cursor: pointer;

    &:hover {
        background: var(--bricks-danger-50);
        color: var(--bricks-danger-600);
    }
}
</style>
