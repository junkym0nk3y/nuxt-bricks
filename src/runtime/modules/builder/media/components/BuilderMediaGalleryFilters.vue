<script setup lang="ts">
// #region Imports
// Types
import type { IMediaGalleryFiltersProps, IMediaGalleryFiltersEmits } from '../types/media';
import type { IBricksTabItem } from '../../../ui/base/tabs/types.d.ts';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Utils
import { MEDIA_CATEGORY_OPTIONS } from '../constants/mediaCategories';

// Components
import BricksTabBar from '../../../ui/base/tabs/BricksTabBar.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IMediaGalleryFiltersProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IMediaGalleryFiltersEmits>();
// #endregion

// #region Data
const { t } = useI18n();
// #endregion

// #region Computed
const categoryItems = computed<IBricksTabItem[]>(() =>
    MEDIA_CATEGORY_OPTIONS.map((option) => ({
        value: option.value,
        label: t(option.label),
    }))
);
// #endregion

// #region Methods
/** Обрабатывает выбор категории-чипа. */
function handleFilterChange(value: string): void {
    emit('update:categoryFilter', value);
}

/** Обрабатывает ввод в поле поиска. */
function onSearchInput(event: Event): void {
    emit('update:searchQuery', (event.target as HTMLInputElement).value);
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderMediaGalleryFilters">
        <div :class="$style.filterGroup">
            <span :class="$style.filterLabel">{{ t('bricks.media.categoryLabel') }}</span>

            <BricksTabBar
                :model-value="props.categoryFilter"
                :items="categoryItems"
                variant="outline"
                wrap
                :group-label="t('bricks.media.categoryFilterLabel')"
                @update:model-value="handleFilterChange"
            />
        </div>

        <div :class="$style.filterGroup">
            <label :class="$style.filterLabel" for="media-search">{{
                t('bricks.media.searchLabel')
            }}</label>
            <input
                id="media-search"
                :value="props.searchQuery"
                :class="$style.searchInput"
                type="text"
                :placeholder="t('bricks.media.searchPlaceholder')"
                @input="onSearchInput"
            />
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderMediaGalleryFilters {
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
}

.filterGroup {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
}

.filterLabel {
    font-size: 1.4rem;
    font-weight: 500;
    color: var(--bricks-base-700);
}

.searchInput {
    flex: 1;
    min-width: 22rem;
    padding: 0.8rem 1.2rem;
    border-radius: 0.6rem;
    border: 1px solid var(--bricks-base-300);
    background: var(--bricks-base-50);
    font-size: 1.4rem;
    color: var(--bricks-base-900);
}
</style>
