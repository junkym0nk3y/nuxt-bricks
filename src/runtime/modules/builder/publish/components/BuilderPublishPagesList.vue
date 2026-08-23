<script setup lang="ts">
/**
 * @description The page list of the dashboard: the segment filter, the loading state,
 * the two empty states and the rows themselves.
 *
 * Decisions held by the markup: the transition covers both the states of the list and
 * the sets of the filter. `mode="out-in"` — the loading, the empty states and the list
 * itself differ a lot in height, and a simultaneous transition would jerk the page
 * around. The key of the list includes the filter, otherwise a change of the segment
 * changes the rows inside the same node and there is no transition at all: to Vue it
 * is the same element. The rows are recreated by that, but they carry no state worth
 * keeping between the sets.
 *
 * The refresh control stands OUTSIDE the transition, next to the filter bar: it has
 * to be reachable from every state of the list — an empty one and a filtered-out one
 * included, which is exactly where a person needs to ask whether anything has
 * changed. Inside the transition it would leave with the rows. While the request is
 * in flight the control reports it by being disabled and nothing else — the same way
 * the row reports a duplication in progress; the rows themselves stay in place,
 * because the question asked was whether anything had changed, not to have the list
 * taken away.
 *
 * One decision is held by the style section: the padding of an empty state is dictated
 * by the section, and for the list it is a tall band in the middle.
 */

// #region Imports
// Types
import type { TPublishedPageSummary } from '../../../common/types/bricks-api';
import type { IBricksTabItem } from '../../../ui/base/tabs/types.d.ts';
import type {
    IPublishPagesListProps,
    IPublishPagesListEmits,
    TPublishPagesFilter,
} from '../types/dashboard';

// Utils
import { markLeavingInert } from '../../../common/utils/transitionInert';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useBuilderPermissions } from '../../core/composables/useBuilderPermissions';

// Components
import BuilderPublishPagesListRow from './BuilderPublishPagesListRow.vue';
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksEmptyState from '../../../ui/feedback/BricksEmptyState.vue';
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
const { canEdit } = useBuilderPermissions();

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
 * Switches the active segment filter.
 *
 * @param value - The value of the picked tab.
 */
function handleSelectFilter(value: string): void {
    const filter = FILTERS.find((item) => item === value);
    if (!filter) {
        return;
    }

    emit('update:activeFilter', filter);
}

/**
 * Emits the creation of the first page out of the empty state.
 */
function handleCreatePage(): void {
    emit('create-page');
}

/**
 * Asks for the list to be re-read. The guard against a repeat lives with the owner
 * of the request, not here: `disabled` closes the button off for the pointer and the
 * keyboard, and it is not protection against a second event.
 */
function handleRefresh(): void {
    emit('refresh');
}

/**
 * Passes the selection of a page through (the details panel).
 *
 * @param page - The page.
 */
function handleSelect(page: TPublishedPageSummary): void {
    emit('select', page);
}

/**
 * Passes through the opening of the page thumbnail in the lightbox.
 *
 * @param page - The page.
 */
function handlePreviewThumbnail(page: TPublishedPageSummary): void {
    emit('preview-thumbnail', page);
}

/**
 * Passes through the move to editing the page.
 *
 * @param page - The page.
 */
function handleEdit(page: TPublishedPageSummary): void {
    emit('edit', page);
}

/**
 * Passes through the opening of the page preview.
 *
 * @param page - The page.
 */
function handlePreview(page: TPublishedPageSummary): void {
    emit('preview', page);
}

/**
 * Passes the duplication of the page through.
 *
 * @param page - The page.
 */
function handleDuplicate(page: TPublishedPageSummary): void {
    emit('duplicate', page);
}

/**
 * Passes through the saving of the page as a template.
 *
 * @param page - The page.
 */
function handleSaveAsTemplate(page: TPublishedPageSummary): void {
    emit('save-as-template', page);
}

/**
 * Passes the deletion of the page through.
 *
 * @param page - The page.
 */
function handleDelete(page: TPublishedPageSummary): void {
    emit('delete', page);
}

/**
 * Puts the interactivity of the departing screen out: under `mode="out-in"` it
 * lives in the DOM through the whole leave phase, and the transition is not always
 * caused by a person's click, which means the focus may be inside. The
 * `pointer-events` from transitions.scss closes off the pointer only.
 *
 * @param element - The root element of the departing screen.
 */
function onViewLeave(element: Element): void {
    markLeavingInert(element);
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderPublishPagesList">
        <div :class="$style.toolbar">
            <BricksTabBar
                :class="$style.filterBar"
                :model-value="props.activeFilter"
                :items="filterItems"
                :group-label="t('bricks.publish.dashboard.filtersLabel')"
                @update:model-value="handleSelectFilter"
            />

            <BricksButton
                size="sm"
                variant="secondary"
                :disabled="props.isLoading || props.isRefreshing"
                @click="handleRefresh"
            >
                {{ t('bricks.publish.dashboard.refresh') }}
            </BricksButton>
        </div>

        <Transition name="bricks-view-switch" mode="out-in" @leave="onViewLeave">
            <div v-if="props.isLoading" key="loading" :class="$style.loading">
                <span :class="$style.spinner" />
                <p :class="$style.loadingText">{{ t('bricks.common.loading') }}</p>
            </div>

            <BricksEmptyState
                v-else-if="props.pages.length === 0 && !props.hasAnyPages"
                key="empty"
                :class="$style.empty"
                icon="ta:outline-files"
                :title="t('bricks.publish.dashboard.empty.title')"
                :description="t('bricks.publish.dashboard.empty.description')"
            >
                <BricksButton v-if="canEdit" size="md" variant="primary" @click="handleCreatePage">
                    + {{ t('bricks.publish.dashboard.empty.cta') }}
                </BricksButton>
            </BricksEmptyState>

            <BricksEmptyState
                v-else-if="props.pages.length === 0"
                key="no-results"
                :class="$style.empty"
                icon="ta:outline-search"
                :title="t('bricks.publish.dashboard.empty.noResultsTitle')"
                :description="t('bricks.publish.dashboard.empty.noResultsDescription')"
            />

            <div v-else :key="`rows-${props.activeFilter}`" :class="$style.rows">
                <BuilderPublishPagesListRow
                    v-for="page in props.pages"
                    :key="page.id"
                    :page="page"
                    :is-duplicating="props.duplicatingPageIds.has(String(page.id))"
                    :is-preparing-template="props.templateSourcePageId === String(page.id)"
                    :is-selected="props.selectedPageId === String(page.id)"
                    @select="handleSelect"
                    @preview-thumbnail="handlePreviewThumbnail"
                    @edit="handleEdit"
                    @preview="handlePreview"
                    @duplicate="handleDuplicate"
                    @save-as-template="handleSaveAsTemplate"
                    @delete="handleDelete"
                />
            </div>
        </Transition>
    </div>
</template>

<style module lang="scss">
.BuilderPublishPagesList {
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
}

.toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
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
    padding: 8rem 2.4rem;
}
</style>
