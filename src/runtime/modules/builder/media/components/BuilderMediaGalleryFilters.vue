<script setup lang="ts">
// #region Imports
// Types
import type { IMediaGalleryFiltersProps, IMediaGalleryFiltersEmits } from '../types/media';

// Utils
import { MEDIA_CATEGORY_OPTIONS } from '../constants/mediaCategories';
// #endregion

// #region Props
const props = withDefaults(defineProps<IMediaGalleryFiltersProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IMediaGalleryFiltersEmits>();
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
            <span :class="$style.filterLabel">Категория:</span>
            <div :class="$style.chipGroup">
                <button
                    v-for="option in MEDIA_CATEGORY_OPTIONS"
                    :key="option.value"
                    type="button"
                    :class="[
                        $style.filterChip,
                        { [$style._active]: props.categoryFilter === option.value },
                    ]"
                    @click="handleFilterChange(option.value)"
                >
                    {{ option.label }}
                </button>
            </div>
        </div>

        <div :class="$style.filterGroup">
            <label :class="$style.filterLabel" for="media-search">Поиск:</label>
            <input
                id="media-search"
                :value="props.searchQuery"
                :class="$style.searchInput"
                type="text"
                placeholder="Введите название или alt"
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

.chipGroup {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
}

.filterChip {
    padding: 0.6rem 1.2rem;
    border-radius: 999px;
    border: 1px solid var(--bricks-base-300);
    background: transparent;
    font-size: 1.2rem;
    color: var(--bricks-base-600);
    transition: all 150ms ease;
    cursor: pointer;

    &._active {
        border-color: var(--bricks-primary-500);
        background: var(--bricks-primary-50);
        color: var(--bricks-primary-600);
    }
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
