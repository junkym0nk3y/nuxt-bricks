<script setup lang="ts">
/**
 * @description Панель деталей файла в разделе «Медиатека»: превью, поля правки,
 * сведения о файле и действия над ним.
 *
 * Контейнер тот же, что у панели деталей страницы, — раздел обязан читаться как
 * отдел дашборда, а не как встроенная модалка. Поэтому горизонтальная
 * мета-панель модалки сюда не переехала: у остальных отделов такой полосы нет.
 *
 * Механизмы при этом старые: те же контролы кита, тот же коммит правки по уходу
 * фокуса (`useMediaMetaDrafts`) и та же техническая сводка, что у плитки и
 * мета-панели. Первичного действия у файла нет: «Отменить» и «Выбрать»
 * принадлежат пикеру, а он остался модалкой.
 */

// #region Imports
// Types
import type { TBrickDemoValues } from '../../../common/types/index';
import type { IBrickUiCommonProp } from '../../../ui/types/common';
import type {
    IMediaSectionDetailsPanelProps,
    IMediaSectionDetailsPanelEmits,
} from '../types/media';

// Utils
import { formatFileSize } from '../utils/formatFileSize';
import { formatMediaDimensions, formatMediaFormatName, isVideoMedia } from '../utils/mediaSummary';
import { formatPageDateTime } from '../../../common/utils/bricks/dates';
import { resolveMediaCategoryLabelBySlug } from '../utils/categoryLabels';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useBuilderPermissions } from '../../core/composables/useBuilderPermissions';
import { useMediaMetaDrafts } from '../composables/useMediaMetaDrafts';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksCloseButton from '../../../ui/base/modal/BricksCloseButton.vue';
import BricksIconButton from '../../../ui/base/icon-button/BricksIconButton.vue';
import BricksImage from '../../../ui/base/image/BricksImage.vue';
import BricksInput from '../../../ui/inputs/BricksInput.vue';
import BricksSelect from '../../../ui/inputs/BricksSelect.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IMediaSectionDetailsPanelProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IMediaSectionDetailsPanelEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const { canEdit, canDelete } = useBuilderPermissions();
/**
 * Черновики полей — тот же композабл, что у мета-панели модалки: правка
 * отправляется по уходу фокуса, а несохранённый ввод переживает серверные
 * обновления.
 */
const {
    filename: editableFilename,
    alt: editableAlt,
    commit: handleMetaCommit,
} = useMediaMetaDrafts({
    item: () => props.item,
    onCommit: (meta) => emit('update-meta', meta),
});
// #endregion

// #region Computed
/**
 * Первым вариантом — «Без категории»: категория необязательна, и снять её файлу
 * можно только отсюда. Пустая строка — контракт `BricksSelect` для пустого
 * значения.
 */
const categoryOptions = computed<IBrickUiCommonProp[]>(() => [
    { label: t('bricks.media.noCategory'), value: '' },
    ...props.categories.map((category) => ({
        label: category.label,
        value: category.slug,
    })),
]);
const categoryFacets = computed<TBrickDemoValues[]>(() =>
    categoryOptions.value.map((option) => option.value)
);
const selectedCategory = computed<string>(() => props.item.category ?? '');
const isVideo = computed<boolean>(() => isVideoMedia(props.item));
/** У видео alt не используется: рендерер отдаёт `<video>`, а не `<img>`. */
const isAltDisabled = computed<boolean>(() => isVideo.value || !canEdit.value);

/**
 * Подзаголовок панели: откуда файл и когда попал в медиатеку. Категория —
 * подписью, а не slug'ом: в данных лежит `promo`, а человек заводил «Промо».
 */
const originLine = computed<string>(() => {
    const category = props.item.category
        ? resolveMediaCategoryLabelBySlug(props.item.category, props.categories)
        : t('bricks.media.noCategory');

    return `${category} · ${t('bricks.media.details.uploadedOn', {
        date: formatPageDateTime(props.item.uploadedAt),
    })}`;
});

/**
 * Сведения о файле парами ключ-значение. Габариты — тем же хелпером, что у
 * плитки и мета-панели: у svg и видео он отдаёт подпись типа, и своя трактовка
 * в третьем месте разошлась бы с остальными двумя.
 */
const fileFacts = computed<{ key: string; label: string; value: string }[]>(() => [
    {
        key: 'size',
        label: t('bricks.media.details.size'),
        value: formatFileSize(props.item.size),
    },
    {
        key: 'dimensions',
        label: t('bricks.media.details.dimensions'),
        value: formatMediaDimensions(props.item, t),
    },
    {
        key: 'format',
        label: t('bricks.media.details.format'),
        value: formatMediaFormatName(props.item.mimeType),
    },
    {
        key: 'uploadedAt',
        label: t('bricks.media.details.uploadedAt'),
        value: formatPageDateTime(props.item.uploadedAt),
    },
]);
// #endregion

// #region Methods
/**
 * Эмитит смену категории файла.
 *
 * Возвращать значение назад не нужно: `BricksSelect` контролируемый и
 * показывает то, что пришло пропом, — при отказе сервера источник не меняется.
 *
 * @param value - Значение селекта.
 */
function handleCategoryChange(value: TBrickDemoValues | null): void {
    if (typeof value !== 'string' || value === selectedCategory.value) {
        return;
    }

    // Пустая строка от селекта — это «без категории», а не пустой slug
    emit('update-category', value || null);
}

/**
 * Копирует адрес файла в буфер обмена.
 */
async function handleCopyUrl(): Promise<void> {
    try {
        await navigator.clipboard.writeText(props.item.url);
        emit('notify', t('bricks.media.details.urlCopied'), 'success');
    } catch {
        emit('notify', t('bricks.media.details.copyFailed'), 'error');
    }
}

/**
 * Просит хост открыть файл во весь экран.
 */
function handlePreview(): void {
    emit('preview');
}

/**
 * Просит хост подтвердить удаление файла.
 */
function handleRemove(): void {
    emit('remove');
}

/**
 * Закрывает панель.
 */
function handleClose(): void {
    emit('close');
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderMediaSectionDetailsPanel">
        <div :class="$style.header">
            <div :class="$style.titleRow">
                <h2 :class="$style.title">{{ props.item.filename }}</h2>
                <BricksCloseButton @click="handleClose" />
            </div>
            <p :class="$style.subtitle">{{ originLine }}</p>
        </div>

        <div :class="[$style.content, 'bricks-scrollbox']">
            <!--
                Превью — картинкой, у видео глифом: кадр из видео взять нечем, а
                пустая рамка читалась бы как незагрузившийся файл
            -->
            <div :class="$style.preview">
                <BricksImage
                    v-if="!isVideo"
                    :src="props.item.previewUrl ?? props.item.url"
                    :alt="props.item.alt || props.item.filename"
                    fit="contain"
                />
                <BricksIcon v-else icon="ta:outline-video" :class="$style.previewIcon" />
            </div>

            <!--
                Поля файла без права правки заблокированы, а не скрыты: имя, alt
                и категория — сведения о файле, и наблюдателю они нужны ровно так
                же. Коммит — по уходу фокуса из группы полей: у `BricksInput`
                события blur в контракте нет, а `focusout` всплывает.
            -->
            <div :class="$style.fields" @focusout="handleMetaCommit">
                <div :class="$style.field">
                    <span :class="$style.fieldLabel">{{ t('bricks.media.nameLabel') }}</span>
                    <BricksInput
                        :value="editableFilename"
                        :disabled="!canEdit"
                        :placeholder="t('bricks.media.filenamePlaceholder')"
                        @update:value="editableFilename = $event"
                    />
                </div>

                <div :class="$style.field">
                    <span :class="$style.fieldLabel">Alt</span>
                    <BricksInput
                        :value="editableAlt"
                        :disabled="isAltDisabled"
                        :placeholder="
                            isVideo
                                ? t('bricks.media.altUnusedForVideo')
                                : t('bricks.media.altPlaceholder')
                        "
                        @update:value="editableAlt = $event"
                    />
                </div>
            </div>

            <div :class="$style.field">
                <span :class="$style.fieldLabel">{{ t('bricks.media.categoryLabel') }}</span>
                <BricksSelect
                    :value="selectedCategory"
                    :specs="categoryOptions"
                    :facets="categoryFacets"
                    :disabled="!canEdit"
                    :aria-label="t('bricks.media.categoryLabel')"
                    @update:value="handleCategoryChange"
                />
            </div>

            <div :class="$style.facts">
                <span :class="$style.groupLabel">{{ t('bricks.media.details.about') }}</span>
                <div v-for="fact in fileFacts" :key="fact.key" :class="$style.factRow">
                    <span :class="$style.factKey">{{ fact.label }}</span>
                    <span :class="$style.factValue">{{ fact.value }}</span>
                </div>
            </div>

            <div :class="$style.field">
                <span :class="$style.fieldLabel">{{ t('bricks.media.details.url') }}</span>
                <div :class="$style.urlRow">
                    <!--
                        `readonly`, а не `disabled`: адрес файла — то, что
                        отсюда уносят, и погашенное поле его не показывает
                        (гасящий тон, недоступное выделение)
                    -->
                    <BricksInput
                        :value="props.item.url"
                        :aria-label="t('bricks.media.details.url')"
                        readonly
                    />
                    <BricksIconButton
                        icon="ta:outline-copy"
                        :label="t('bricks.media.details.copyUrl')"
                        variant="ghost"
                        @click="handleCopyUrl"
                    />
                </div>
            </div>
        </div>

        <!--
            Удаление файла — право администратора: редактору ручка откажет, и
            кнопки у него нет вовсе. Просмотр во весь экран остаётся у всех
        -->
        <div :class="$style.footer">
            <BricksButton
                :class="$style.previewButton"
                size="md"
                variant="secondary"
                @click="handlePreview"
            >
                {{ t('bricks.media.fullscreen') }}
            </BricksButton>

            <BricksIconButton
                v-if="canDelete"
                icon="ta:outline-trash"
                :label="t('bricks.common.delete')"
                danger
                @click="handleRemove"
            />
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderMediaSectionDetailsPanel {
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
    flex-direction: column;
    gap: 1.6rem;
    padding: 1.6rem 2rem;
}

/* Превью держит высоту макета: пропорция файла неизвестна заранее, а панель без
   фиксированной рамки прыгала бы на каждый выбор. */
.preview {
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    height: 16.8rem;
    border-radius: var(--bricks-border-radius-sm);
    background: var(--bricks-base-100);
}

.previewIcon {
    width: 3.2rem;
    height: 3.2rem;
    color: var(--bricks-base-500);
}

.fields {
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
}

.field {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    min-width: 0;
}

.fieldLabel {
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--bricks-base-500);
}

.facts {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
}

.groupLabel {
    text-transform: uppercase;
    font-size: 1.2rem;
    font-weight: 600;
    letter-spacing: 0.05rem;
    color: var(--bricks-base-400);
}

.factRow {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1.2rem;
}

.factKey {
    flex-shrink: 0;
    font-size: 1.2rem;
    color: var(--bricks-base-500);
}

.factValue {
    overflow: hidden;
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.2rem;
    color: var(--bricks-base-900);
}

.urlRow {
    display: flex;
    align-items: center;
    gap: 0.8rem;
}

.footer {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    gap: 0.8rem;
    padding: 1.6rem 2rem;
    border-top: 1px solid var(--bricks-base-200);
}

.previewButton {
    flex: 1;
}
</style>
