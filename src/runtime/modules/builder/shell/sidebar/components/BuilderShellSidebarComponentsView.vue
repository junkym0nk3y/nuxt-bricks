<script setup lang="ts">
/**
 * @description Library view of the sidebar: the search, the favorites filter and the
 * component cards grouped by category.
 *
 * The favorites toggle is the kit icon button rather than one of our own: the button
 * that stood here before had no accessible name at all, and a screen reader announced
 * the library filter as an unnamed button. The pressed state is announced by the kit
 * through `aria-pressed`.
 *
 * Two decisions held by the style section: an empty state takes the whole free height
 * of the panel — it is narrow and tall, and a message in its center reads as the
 * answer about an empty list rather than as one more line of text; and the names of
 * the skipped bricks wrap anywhere, because a long brick name would push the sidebar
 * wider otherwise.
 */

// #region Imports
// Types
import type { IComponentLibraryItem } from '../../../../common/types/brick';
import type { ISidebarComponentsViewProps, ISidebarComponentsViewEmits } from '../types/components';

// Vue
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Utils
import { loadFavoritesFromStorage } from '../../../core/stores/actions/favorites';
import { groupComponentsByCategory } from '../utils/componentCategories';

// Components
import BuilderShellSidebarComponentCard from './BuilderShellSidebarComponentCard.vue';
import BricksButton from '../../../../ui/base/button/BricksButton.vue';
import BricksCloseButton from '../../../../ui/base/modal/BricksCloseButton.vue';
import BricksEmptyState from '../../../../ui/feedback/BricksEmptyState.vue';
import BricksIconButton from '../../../../ui/base/icon-button/BricksIconButton.vue';
import BricksSearchInput from '../../../../ui/inputs/BricksSearchInput.vue';
// #endregion

// #region Props
const props = defineProps<ISidebarComponentsViewProps>();
// #endregion

// #region Emits
const emit = defineEmits<ISidebarComponentsViewEmits>();
// #endregion

// #region Data
const { t, te } = useI18n();
const searchQuery = ref('');
const showFavoritesOnly = ref(false);
// #endregion

// #region Computed
/**
 * Filters the components by the search query and by the favorites flag.
 *
 * @returns Components that match the filters.
 */
const filteredComponents = computed<IComponentLibraryItem[]>(() => {
    let result = props.components;

    if (showFavoritesOnly.value) {
        const favorites = loadFavoritesFromStorage();
        result = result.filter((component) => favorites.includes(component.name));
    }

    const query = searchQuery.value.toLowerCase().trim();
    if (query) {
        result = result.filter((component) => {
            const nameMatch = component.name.toLowerCase().includes(query);
            const descriptionMatch = component.description?.toLowerCase().includes(query) ?? false;
            return nameMatch || descriptionMatch;
        });
    }

    return result;
});

/**
 * Groups the filtered components by category for display. The 'Layout' category is
 * laid out as a two-column grid of compact cards, every other one as a single column
 * of live previews; which categories are left out is decided by the grouping itself
 * (utils/componentCategories.ts).
 *
 * @returns Map of "category name → components".
 */
const categorizedComponents = computed<Map<string, IComponentLibraryItem[]>>(() =>
    groupComponentsByCategory(filteredComponents.value)
);

/**
 * Whether the library has anything to show.
 *
 * @returns True when there is at least one component.
 */
const hasAvailableComponents = computed<boolean>(() => props.components.length > 0);

/**
 * Whether the filtering left any results.
 *
 * @returns True when at least one category still has components.
 */
const hasFilteredResults = computed<boolean>(() => categorizedComponents.value.size > 0);

/**
 * Names of the skipped bricks in a single line — a developer finds the problem by
 * them, and a user sees what exactly is missing from the list.
 *
 * They are listed apart from the failure block and with no retry button: the answer
 * from the endpoint did arrive, individual bricks simply did not build, and a retry
 * would not bring them back.
 */
const skippedBrickNames = computed<string>(() =>
    props.skippedBricks.map((brick) => brick.name).join(', ')
);

/**
 * The hint about a restart is only of use where a restart is possible. Every skip now
 * means the manifest and the build have gone out of sync — the library is assembled
 * from the manifest and imports no brick modules, so there is nothing left to fail on
 * an import.
 */
const isDevHintVisible = computed<boolean>(
    () => import.meta.dev === true && props.skippedBricks.length > 0
);
// #endregion

// #region Methods
/**
 * Emits the sidebar close event for the parent component.
 */
function handleClose(): void {
    emit('close');
}

/**
 * Translates a category name: a known category through the
 * `bricks.library.categories.*` map, a custom string of the consumer as it is.
 */
function resolveCategoryLabel(category: string): string {
    const key = `bricks.library.categories.${category.toLowerCase()}`;
    return te(key) ? t(key) : category;
}

/**
 * Asks the composition root to load the library again.
 */
function handleRetry(): void {
    emit('retry');
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderShellSidebarComponentsView">
        <div :class="$style.header">
            <h2 :class="$style.title">{{ t('bricks.library.title') }}</h2>
            <BricksCloseButton @click="handleClose" />
        </div>

        <div :class="$style.search">
            <div :class="$style.searchRow">
                <BricksSearchInput
                    :value="searchQuery"
                    :placeholder="t('bricks.library.searchPlaceholder')"
                    @update:value="(val: string) => (searchQuery = val)"
                />
                <BricksIconButton
                    :icon="showFavoritesOnly ? 'ta:filled-star' : 'ta:outline-star'"
                    :label="t('bricks.library.favoritesToggle')"
                    size="lg"
                    :active="showFavoritesOnly"
                    @click="showFavoritesOnly = !showFavoritesOnly"
                />
            </div>
        </div>

        <div :class="[$style.content, 'bricks-scrollbox']">
            <div v-if="props.isLibraryLoadFailed" :class="$style.loadError">
                <span :class="$style.loadErrorIcon">
                    <BricksIcon icon="ta:outline-circle-x" />
                </span>
                <p :class="$style.loadErrorText">{{ t('bricks.library.loadFailed') }}</p>
                <BricksButton
                    size="sm"
                    variant="secondary"
                    :disabled="props.isLibraryLoading"
                    @click="handleRetry"
                >
                    {{ t('bricks.library.retry') }}
                </BricksButton>
            </div>

            <div v-if="props.skippedBricks.length > 0" :class="$style.skipped">
                <span :class="$style.skippedIcon">
                    <BricksIcon icon="ta:outline-info-circle" />
                </span>
                <p :class="$style.skippedText">
                    {{ t('bricks.library.skippedBricks', { count: props.skippedBricks.length }) }}
                </p>
                <p :class="$style.skippedNames">{{ skippedBrickNames }}</p>
                <p v-if="isDevHintVisible" :class="$style.skippedHint">
                    {{ t('bricks.library.skippedBricksDevHint') }}
                </p>
            </div>

            <div
                v-for="[category, groupedComponents] in categorizedComponents"
                :key="category"
                :class="$style.category"
            >
                <h3 :class="$style.categoryTitle">
                    {{ resolveCategoryLabel(category) }}
                </h3>

                <div
                    :class="[
                        $style.componentList,
                        category === 'Layout'
                            ? $style.componentListGrid
                            : $style.componentListSingle,
                    ]"
                >
                    <BuilderShellSidebarComponentCard
                        v-for="component in groupedComponents"
                        :key="component.brickPath"
                        :component="component"
                        :is-layout="category === 'Layout'"
                    />
                </div>
            </div>

            <BricksEmptyState
                v-if="hasAvailableComponents && !hasFilteredResults"
                :class="$style.empty"
                size="sm"
                icon="ta:outline-search"
                :title="t('bricks.common.notFound')"
                :description="t('bricks.library.emptyHint')"
            />

            <BricksEmptyState
                v-if="!hasAvailableComponents"
                :class="$style.empty"
                size="sm"
                icon="ta:outline-package"
                :title="t('bricks.library.noComponents')"
                :description="t('bricks.library.noComponentsHint')"
            />
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderShellSidebarComponentsView {
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

.search {
    padding: 1.2rem 2rem;
    border-bottom: 1px solid var(--bricks-base-300);
}

.searchRow {
    display: flex;
    align-items: center;
    gap: 0.8rem;
}

.content {
    overflow-y: auto;
    flex: 1;
    padding: 1.2rem;
}

.category {
    margin-bottom: 2.4rem;

    &:last-child {
        margin-bottom: 0;
    }
}

.categoryTitle {
    margin: 0 0 1.2rem 0;
    text-transform: uppercase;
    font-size: 1.2rem;
    font-weight: 600;
    letter-spacing: 0.05rem;
    color: var(--bricks-base-600);
}

.componentList {
    display: grid;
    gap: 1.2rem;
}

.componentListGrid {
    grid-template-columns: repeat(2, 1fr);
}

.componentListSingle {
    grid-template-columns: 1fr;
}

.empty {
    height: 100%;
}

.loadError {
    display: flex;
    align-items: center;
    margin-bottom: 1.6rem;
    padding: 1.6rem;
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid var(--bricks-base-300);
    background-color: var(--bricks-base-50);
    text-align: center;
    flex-direction: column;
    gap: 0.8rem;
}

.loadErrorIcon {
    color: var(--bricks-base-400);

    svg {
        width: 2.4rem;
        height: 2.4rem;
    }
}

.loadErrorText {
    margin: 0;
    font-size: 1.2rem;
    color: var(--bricks-base-600);
}

.skipped {
    display: flex;
    align-items: center;
    margin-bottom: 1.6rem;
    padding: 1.6rem;
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid var(--bricks-base-300);
    background-color: var(--bricks-base-50);
    text-align: center;
    flex-direction: column;
    gap: 0.4rem;
}

.skippedIcon {
    color: var(--bricks-base-400);

    svg {
        width: 2.4rem;
        height: 2.4rem;
    }
}

.skippedText {
    margin: 0;
    font-size: 1.2rem;
    color: var(--bricks-base-600);
}

.skippedNames {
    margin: 0;
    overflow-wrap: anywhere;
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--bricks-base-700);
}

.skippedHint {
    margin: 0;
    font-size: 1rem;
    color: var(--bricks-base-500);
}
</style>
