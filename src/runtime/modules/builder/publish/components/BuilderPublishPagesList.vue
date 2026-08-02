<script setup lang="ts">
// #region Imports
// Types
import type { TPublishedPageSummary } from '../../../common/types/bricks-api';
import type { IBricksTabItem } from '../../../ui/base/tabs/types.d.ts';
import type {
    IPublishPagesListProps,
    IPublishPagesListEmits,
    TPublishPagesFilter,
} from '../types/dashboard';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BuilderPublishPagesListRow from './BuilderPublishPagesListRow.vue';
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksTabBar from '../../../ui/base/tabs/BricksTabBar.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IPublishPagesListProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IPublishPagesListEmits>();
// #endregion

// #region Data
const { t } = useI18n();

const FILTERS: TPublishPagesFilter[] = ['all', 'published', 'drafts'];
// #endregion

// #region Computed
const filterItems = computed<IBricksTabItem[]>(() =>
    FILTERS.map((filter) => ({
        value: filter,
        label: t(`bricks.publish.dashboard.filters.${filter}`),
        count: props.counts[filter],
    }))
);
// #endregion

// #region Methods
/**
 * Переключает активный сегмент-фильтр.
 *
 * @param value - Значение выбранного таба.
 */
function handleSelectFilter(value: string): void {
    const filter = FILTERS.find((item) => item === value);
    if (!filter) {
        return;
    }

    emit('update:activeFilter', filter);
}

/**
 * Эмитит создание первой страницы из пустого состояния.
 */
function handleCreatePage(): void {
    emit('create-page');
}

/**
 * Пробрасывает выбор страницы (панель деталей).
 *
 * @param page - Страница.
 */
function handleSelect(page: TPublishedPageSummary): void {
    emit('select', page);
}

/**
 * Пробрасывает открытие превью-миниатюры страницы в лайтбоксе.
 *
 * @param page - Страница.
 */
function handlePreviewThumbnail(page: TPublishedPageSummary): void {
    emit('preview-thumbnail', page);
}

/**
 * Пробрасывает переход к редактированию страницы.
 *
 * @param page - Страница.
 */
function handleEdit(page: TPublishedPageSummary): void {
    emit('edit', page);
}

/**
 * Пробрасывает открытие превью страницы.
 *
 * @param page - Страница.
 */
function handlePreview(page: TPublishedPageSummary): void {
    emit('preview', page);
}

/**
 * Пробрасывает дублирование страницы.
 *
 * @param page - Страница.
 */
function handleDuplicate(page: TPublishedPageSummary): void {
    emit('duplicate', page);
}

/**
 * Пробрасывает удаление страницы.
 *
 * @param page - Страница.
 */
function handleDelete(page: TPublishedPageSummary): void {
    emit('delete', page);
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderPublishPagesList">
        <BricksTabBar
            :class="$style.filterBar"
            :model-value="props.activeFilter"
            :items="filterItems"
            :group-label="t('bricks.publish.dashboard.filtersLabel')"
            @update:model-value="handleSelectFilter"
        />

        <div v-if="props.isLoading" :class="$style.loading">
            <span :class="$style.spinner" />
            <p :class="$style.loadingText">{{ t('bricks.common.loading') }}</p>
        </div>

        <div v-else-if="props.pages.length === 0 && !props.hasAnyPages" :class="$style.empty">
            <div :class="$style.emptyIconCircle">
                <BricksIcon icon="ta:outline-files" :class="$style.emptyIcon" />
            </div>
            <h2 :class="$style.emptyTitle">{{ t('bricks.publish.dashboard.empty.title') }}</h2>
            <p :class="$style.emptyDescription">
                {{ t('bricks.publish.dashboard.empty.description') }}
            </p>
            <BricksButton size="md" variant="primary" @click="handleCreatePage">
                + {{ t('bricks.publish.dashboard.empty.cta') }}
            </BricksButton>
        </div>

        <div v-else-if="props.pages.length === 0" :class="$style.empty">
            <div :class="$style.emptyIconCircle">
                <BricksIcon icon="ta:outline-search" :class="$style.emptyIcon" />
            </div>
            <h2 :class="$style.emptyTitle">
                {{ t('bricks.publish.dashboard.empty.noResultsTitle') }}
            </h2>
            <p :class="$style.emptyDescription">
                {{ t('bricks.publish.dashboard.empty.noResultsDescription') }}
            </p>
        </div>

        <div v-else :class="$style.rows">
            <BuilderPublishPagesListRow
                v-for="page in props.pages"
                :key="page.id"
                :page="page"
                :is-duplicating="props.duplicatingPageId === String(page.id)"
                :is-selected="props.selectedPageId === String(page.id)"
                @select="handleSelect"
                @preview-thumbnail="handlePreviewThumbnail"
                @edit="handleEdit"
                @preview="handlePreview"
                @duplicate="handleDuplicate"
                @delete="handleDelete"
            />
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderPublishPagesList {
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
}

.filterBar {
    align-self: flex-start;
}

.rows {
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
}

.loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 6rem 2rem;
    color: var(--bricks-base-500);
}

.spinner {
    width: 3.2rem;
    height: 3.2rem;
    margin-bottom: 1.2rem;
    border-radius: 50%;
    border: 0.4rem solid var(--bricks-base-200);
    border-top-color: var(--bricks-base-400);
    animation: spin 1s linear infinite;
}

@keyframes spin {
    0% {
        transform: rotate(0deg);
    }

    100% {
        transform: rotate(360deg);
    }
}

.loadingText {
    margin: 0;
    font-size: 1.4rem;
}

.empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.8rem;
    padding: 8rem 2.4rem;
}

.emptyIconCircle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 6.4rem;
    height: 6.4rem;
    margin-bottom: 1.2rem;
    border-radius: 50%;
    background: var(--bricks-base-100);
}

.emptyIcon {
    width: 2.8rem;
    height: 2.8rem;
    color: var(--bricks-base-400);
}

.emptyTitle {
    margin: 0;
    font-size: 1.6rem;
    font-weight: 700;
    color: var(--bricks-base-900);
}

.emptyDescription {
    max-width: 36rem;
    margin: 0 0 1.6rem;
    text-align: center;
    font-size: 1.4rem;
    color: var(--bricks-base-500);
}
</style>
