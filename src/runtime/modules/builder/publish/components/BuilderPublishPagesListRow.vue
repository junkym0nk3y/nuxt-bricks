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
    <article
        :class="[
            $style.BuilderPublishPagesListRow,
            props.isSelected && $style.BuilderPublishPagesListRowSelected,
        ]"
        @click="handleSelect"
    >
        <span :class="[$style.statusDot, props.page.published && $style['statusDot--published']]" />

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
                <BricksBadge v-if="!props.page.published">
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
    </article>
</template>

<style module lang="scss">
.BuilderPublishPagesListRow {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    padding: 1.4rem 1.6rem;
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    transition:
        border-color var(--bricks-default-transition),
        box-shadow var(--bricks-default-transition);
    cursor: pointer;
    gap: 0.8rem 1.2rem;

    &:hover {
        border-color: var(--bricks-primary-300);
        box-shadow: var(--bricks-shadow-sm);

        .actions {
            opacity: 1;
            pointer-events: auto;
        }
    }
}

.BuilderPublishPagesListRowSelected {
    border-color: var(--bricks-primary-300);
    box-shadow: var(--bricks-shadow-sm);
}

.statusDot {
    flex-shrink: 0;
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 50%;
    background: var(--bricks-base-300);

    &--published {
        background: var(--bricks-green);
    }
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
