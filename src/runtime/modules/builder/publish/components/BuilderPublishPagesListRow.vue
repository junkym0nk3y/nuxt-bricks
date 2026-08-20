<script setup lang="ts">
// #region Imports
// Types
import type { IPublishPagesListRowProps, IPublishPagesListRowEmits } from '../types/dashboard';

// Utils
import { formatPageDate } from '../../../common/utils/bricks/dates';
import { toPageAddress } from '../../../common/utils/bricks/pageAddress';
import { getPublishedPagePath } from '../../../common/utils/bricks/routePaths';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useBuilderPermissions } from '../../core/composables/useBuilderPermissions';

// Components
import BricksBadge from '../../../ui/base/badge/BricksBadge.vue';
import BricksIconButton from '../../../ui/base/icon-button/BricksIconButton.vue';
import BricksSurfaceCard from '../../../ui/base/surface/BricksSurfaceCard.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IPublishPagesListRowProps>(), {
    isDuplicating: false,
    isPreparingTemplate: false,
    isSelected: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IPublishPagesListRowEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const { canEdit, canDelete } = useBuilderPermissions();
// #endregion

// #region Computed
/**
 * Дата последнего изменения (updatedAt || createdAt) в формате DD.MM.YYYY.
 */
const formattedDate = computed<string>(() =>
    formatPageDate(props.page.updatedAt || props.page.createdAt)
);

/**
 * Подпись статуса — доступное имя точки в начале строки. Видимой подписи у
 * статуса здесь нет: у черновика рядом с именем стоит плашка «Черновик», а у
 * опубликованной страницы статус читается только цветом точки.
 */
const statusLabel = computed<string>(() =>
    props.page.published
        ? t('bricks.publish.dashboard.row.statusPublished')
        : t('bricks.publish.dashboard.row.statusDraft')
);

/**
 * Live-адрес страницы (`/blog/post`). Полный адрес, а не один `pagename`: имя
 * уникально только внутри своего префикса, и две одноимённые страницы под разными
 * префиксами выглядели бы в списке одинаково — `/post` и `/post`.
 */
const pageAddressPath = computed<string>(() =>
    getPublishedPagePath(toPageAddress(props.page.pagename, props.page.urlPrefix))
);
// #endregion

// #region Methods
/**
 * Эмитит выбор страницы (открытие панели деталей).
 */
function handleSelect(): void {
    emit('select', props.page);
}

/**
 * Эмитит открытие превью-миниатюры страницы в лайтбоксе.
 */
function handlePreviewThumbnail(): void {
    emit('preview-thumbnail', props.page);
}

/**
 * Эмитит переход к редактированию страницы.
 */
function handleEdit(): void {
    emit('edit', props.page);
}

/**
 * Эмитит открытие превью страницы.
 */
function handlePreview(): void {
    emit('preview', props.page);
}

/**
 * Эмитит дублирование страницы.
 */
function handleDuplicate(): void {
    emit('duplicate', props.page);
}

/**
 * Эмитит сохранение страницы как шаблона.
 */
function handleSaveAsTemplate(): void {
    emit('save-as-template', props.page);
}

/**
 * Эмитит удаление страницы.
 */
function handleDelete(): void {
    emit('delete', props.page);
}
// #endregion
</script>

<template>
    <BricksSurfaceCard
        as="article"
        clickable
        :selected="props.isSelected"
        :class="$style.BuilderPublishPagesListRow"
        @click="handleSelect"
    >
        <!--
            Статус страницы держался на одном цвете: подпись «Черновик» стоит
            рядом с именем, а опубликованная страница не объявляла статус вовсе —
            ни скринридеру, ни человеку, не различающему зелёный. Имя даёт
            `role="img"` с подписью: вид строки при этом не меняется.
        -->
        <BricksBadge
            tone="plain"
            :dot="props.page.published ? 'positive' : 'neutral'"
            :class="$style.statusDot"
            role="img"
            :aria-label="statusLabel"
        />

        <button
            v-if="props.page.thumbnailUrl"
            :class="[$style.thumbnail, $style.thumbnailClickable]"
            type="button"
            :title="t('bricks.publish.dashboard.row.thumbnailPreview')"
            :aria-label="t('bricks.publish.dashboard.row.thumbnailPreview')"
            @click.stop="handlePreviewThumbnail"
        >
            <img
                :class="$style.thumbnailImage"
                :src="props.page.thumbnailUrl"
                :alt="props.page.title || props.page.pagename"
                loading="lazy"
            />
        </button>
        <div v-else :class="$style.thumbnail">
            <BricksIcon icon="ta:outline-photo" :class="$style.thumbnailPlaceholder" />
        </div>

        <div :class="$style.main">
            <div :class="$style.titleRow">
                <h3 :class="$style.title">{{ props.page.title }}</h3>
                <span :class="$style.pagename">{{ pageAddressPath }}</span>
                <!--
                    Тон `muted`, а не дефолтный `primary`: «Черновик» — тихий
                    статус, а заливка primary в ките значит «главное здесь»
                    («Текущая» у версии, выбранный файл в медиатеке). Синей
                    плашкой каждая неопубликованная страница кричала акцентом,
                    хотя статус рядом уже несёт точка.
                -->
                <BricksBadge v-if="!props.page.published" tone="muted">
                    {{ t('bricks.publish.dashboard.row.draft') }}
                </BricksBadge>
            </div>
            <p v-if="props.page.description" :class="$style.description">
                {{ props.page.description }}
            </p>
        </div>

        <span :class="$style.date">
            {{ t('bricks.publish.dashboard.row.updated', { date: formattedDate }) }}
        </span>

        <div :class="$style.actions" @click.stop>
            <BricksIconButton
                icon="ta:outline-pencil"
                :label="t('bricks.publish.dashboard.row.edit')"
                @click="handleEdit"
            />

            <BricksIconButton
                icon="ph:eye"
                :label="t('bricks.publish.dashboard.row.preview')"
                @click="handlePreview"
            />

            <!-- Копия — создание страницы: доступно редактору и выше -->
            <BricksIconButton
                v-if="canEdit"
                icon="ta:outline-copy"
                :label="t('bricks.publish.dashboard.row.duplicate')"
                :disabled="props.isDuplicating"
                @click="handleDuplicate"
            />

            <!--
                Шаблон из страницы — между копией и удалением: обе соседки тоже
                создают или уничтожают сущность, а не правят текущую. Как и
                копия, это создание записи — доступно редактору и выше
            -->
            <BricksIconButton
                v-if="canEdit"
                icon="ta:outline-package"
                :label="t('bricks.publish.dashboard.row.saveAsTemplate')"
                :disabled="props.isPreparingTemplate"
                @click="handleSaveAsTemplate"
            />

            <!-- Удаление страницы — только администратору -->
            <BricksIconButton
                v-if="canDelete"
                icon="ta:outline-trash"
                :label="t('bricks.publish.dashboard.row.delete')"
                danger
                @click="handleDelete"
            />
        </div>
    </BricksSurfaceCard>
</template>

<style module lang="scss">
/* Вид поверхности — из кита (`BricksSurfaceCard`); здесь только раскладка строки
   и то, что она делает с содержимым на наведении. */
.BuilderPublishPagesListRow {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    padding: 1.4rem 1.6rem;
    gap: 0.8rem 1.2rem;

    &:hover,
    &:focus-within {
        .actions {
            opacity: 1;
            pointer-events: auto;
        }
    }
}

.statusDot {
    flex-shrink: 0;
}

.thumbnail {
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 9.6rem;
    height: 6rem;
    border-radius: var(--bricks-border-radius-xs);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-100);
}

.thumbnailClickable {
    padding: 0;
    transition: border-color var(--bricks-default-transition);
    cursor: zoom-in;

    &:hover {
        border-color: var(--bricks-primary-300);
    }
}

.thumbnailImage {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top;
}

.thumbnailPlaceholder {
    font-size: 2rem;
    color: var(--bricks-base-400);
}

.main {
    display: flex;

    // basis 18rem — порог переноса: дата и действия уходят на вторую строку,
    // не отрывая блок от статус-точки (auto-basis раздувался бы до max-content)
    flex: 1 1 18rem;
    flex-direction: column;
    gap: 0.4rem;
    min-width: 0;
}

.titleRow {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.4rem 0.8rem;
    min-width: 0;
}

.title {
    overflow: hidden;
    margin: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.4rem;
    font-weight: 600;
    color: var(--bricks-base-900);
}

.pagename {
    flex-shrink: 0;
    font-size: 1.2rem;
    color: var(--bricks-base-400);
}

.description {
    overflow: hidden;
    margin: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.2rem;
    color: var(--bricks-base-500);
}

.date {
    flex-shrink: 0;
    margin-left: auto;
    white-space: nowrap;
    font-size: 1.2rem;
    color: var(--bricks-base-400);
}

.actions {
    display: flex;
    flex-shrink: 0;
    gap: 0.6rem;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--bricks-default-transition);

    &:focus-within {
        opacity: 1;
        pointer-events: auto;
    }
}
</style>
