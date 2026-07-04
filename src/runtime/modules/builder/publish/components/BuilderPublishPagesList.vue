<script setup lang="ts">
// #region Imports
// Types
import type { IPublishedPage } from '../../../common/types/bricks-api';
import type {
    IPublishPagesListProps,
    IPublishPagesListEmits,
    TPublishPagesFilter,
} from '../types/dashboard';

// Vue
import { useI18n } from 'vue-i18n';

// Components
import BuilderPublishPagesListRow from './BuilderPublishPagesListRow.vue';
import BricksButton from '../../../ui/base/button/BricksButton.vue';
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

// #region Methods
/**
 * Переключает активный сегмент-фильтр.
 *
 * @param filter - Ключ фильтра.
 */
function handleSelectFilter(filter: TPublishPagesFilter): void {
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
function handleSelect(page: IPublishedPage): void {
    emit('select', page);
}

/**
 * Пробрасывает переход к редактированию страницы.
 *
 * @param page - Страница.
 */
function handleEdit(page: IPublishedPage): void {
    emit('edit', page);
}

/**
 * Пробрасывает открытие превью страницы.
 *
 * @param page - Страница.
 */
function handlePreview(page: IPublishedPage): void {
    emit('preview', page);
}

/**
 * Пробрасывает дублирование страницы.
 *
 * @param page - Страница.
 */
function handleDuplicate(page: IPublishedPage): void {
    emit('duplicate', page);
}

/**
 * Пробрасывает удаление страницы.
 *
 * @param page - Страница.
 */
function handleDelete(page: IPublishedPage): void {
    emit('delete', page);
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderPublishPagesList">
        <div :class="$style.filterBar">
            <button
                v-for="filter in FILTERS"
                :key="filter"
                :class="[$style.filterTab, filter === props.activeFilter && $style.filterTabActive]"
                type="button"
                @click="handleSelectFilter(filter)"
            >
                {{ t(`bricks.publish.dashboard.filters.${filter}`) }} · {{ props.counts[filter] }}
            </button>
        </div>

        <div v-if="props.isLoading" :class="$style.loading">
            <span :class="$style.spinner" />
            <p :class="$style.loadingText">{{ t('bricks.common.loading') }}</p>
        </div>

        <div v-else-if="props.pages.length === 0 && !props.hasAnyPages" :class="$style.empty">
            <div :class="$style.emptyIconCircle">
                <BricksIcon icon="ca:document-multiple-02" :class="$style.emptyIcon" />
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
                <BricksIcon icon="ph:magnifying-glass" :class="$style.emptyIcon" />
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
    display: flex;
    align-self: flex-start;
    gap: 0.2rem;
    padding: 0.2rem;
    border-radius: var(--border-radius-xs);
    background: var(--bricks-base-100);
}

.filterTab {
    padding: 0.6rem 1.2rem;
    border-radius: 0.4rem;
    border: none;
    background: transparent;
    white-space: nowrap;
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--bricks-base-500);
    transition:
        color var(--default-transition),
        background-color var(--default-transition);
    cursor: pointer;

    &:hover {
        color: var(--bricks-base-900);
    }
}

.filterTabActive {
    background: var(--bricks-base-0);
    box-shadow: var(--shadow-sm);
    font-weight: 600;
    color: var(--bricks-base-900);
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
