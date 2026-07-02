<script setup lang="ts">
// #region Imports
// Types
import type { IComponentLibraryItem } from '../../../../common/types/brick';

// Vue
import { computed, ref } from 'vue';

// Utils
import { loadFavoritesFromStorage } from '../../../core/stores/actions/favorites';

// Components
import BuilderShellSidebarComponentCard from './BuilderShellSidebarComponentCard.vue';
import BricksCloseButton from '../../../../ui/base/modal/BricksCloseButton.vue';
// #endregion

// #region Props
const props = defineProps<{
    components: IComponentLibraryItem[];
}>();
// #endregion

// #region Emits
const emit = defineEmits<{
    close: [];
}>();
// #endregion

// #region Data
const searchQuery = ref('');
const showFavoritesOnly = ref(false);
// #endregion

// #region Computed
/**
 * Фильтрует компоненты по поисковому запросу и избранному
 * @returns Массив компонентов, соответствующих фильтрам
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
 * Группирует доступные компоненты по категориям для отображения в сайдбаре
 *
 * Категории:
 * - 'Layout' - отображаются в grid 2 колонки с высотой миниатюры 12rem
 * - Остальные (Slider, Cards и т.д.) - отображаются в 1 колонку с высотой 18rem
 * - 'Modal' - исключается из отображения (модальные окна не добавляются на канвас)
 *
 * @returns Объект где ключ - название категории, значение - массив компонентов
 */
const categorizedComponents = computed<Record<string, IComponentLibraryItem[]>>(() => {
    const grouped: Record<string, IComponentLibraryItem[]> = {};

    filteredComponents.value.forEach((component) => {
        if (component.category === 'Modal') {
            return;
        }

        if (!grouped[component.category]) {
            grouped[component.category] = [];
        }

        grouped[component.category].push(component);
    });

    return grouped;
});

/**
 * Проверяет наличие компонентов для отображения в библиотеке
 * @returns true если есть хотя бы один компонент
 */
const hasAvailableComponents = computed<boolean>(() => props.components.length > 0);

/**
 * Проверяет, есть ли результаты после фильтрации
 * @returns true если есть хотя бы одна категория с компонентами
 */
const hasFilteredResults = computed<boolean>(
    () => Object.keys(categorizedComponents.value).length > 0
);
// #endregion

// #region Methods
/**
 * Эмитит событие закрытия сайдбара для родительского компонента
 */
function handleClose(): void {
    emit('close');
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderShellSidebarComponentsView">
        <div :class="$style.header">
            <h2 :class="$style.title">Добавить компонент</h2>
            <BricksCloseButton @click="handleClose" />
        </div>

        <div :class="$style.search">
            <div :class="$style.searchRow">
                <div :class="$style.searchInner">
                    <BricksIcon :class="$style.searchIcon" icon="ph:magnifying-glass" />
                    <input
                        v-model="searchQuery"
                        :class="$style.searchInput"
                        type="text"
                        placeholder="Поиск компонентов..."
                        autocomplete="off"
                    />
                    <button
                        v-if="searchQuery"
                        :class="$style.searchClear"
                        type="button"
                        @click="searchQuery = ''"
                    >
                        <BricksIcon icon="ph:x" />
                    </button>
                </div>
                <button
                    :class="[
                        $style.favoritesToggle,
                        { [$style.favoritesToggleActive]: showFavoritesOnly },
                    ]"
                    type="button"
                    @click="showFavoritesOnly = !showFavoritesOnly"
                >
                    <BricksIcon :icon="showFavoritesOnly ? 'ph:star-fill' : 'ph:star'" />
                </button>
            </div>
        </div>

        <div :class="[$style.content, 'scrollbox']">
            <div
                v-for="(groupedComponents, category) in categorizedComponents"
                :key="category"
                :class="$style.category"
            >
                <h3 :class="$style.categoryTitle">
                    {{ category }}
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

            <div v-if="hasAvailableComponents && !hasFilteredResults" :class="$style.empty">
                <span :class="$style.emptyIcon">
                    <BricksIcon icon="ph:magnifying-glass" />
                </span>
                <p>Ничего не найдено</p>
                <p :class="$style.emptyHint">Попробуйте изменить поисковый запрос</p>
            </div>

            <div v-if="!hasAvailableComponents" :class="$style.empty">
                <span :class="$style.emptyIcon">
                    <BricksIcon icon="ph:package" />
                </span>
                <p>No components available</p>
                <p :class="$style.emptyHint">
                    Run <code>npm run bricks:gen</code> to generate component list
                </p>
            </div>
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

.favoritesToggle {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 3.6rem;
    height: 3.6rem;
    padding: 0;
    border-radius: 0.8rem;
    border: 1px solid var(--bricks-base-300);
    background-color: var(--bricks-base-50);
    color: var(--bricks-base-400);
    transition: all var(--default-transition);
    cursor: pointer;

    svg {
        width: 1.6rem;
        height: 1.6rem;
    }

    &:hover {
        border-color: var(--bricks-primary);
        color: var(--bricks-primary);
    }
}

.favoritesToggleActive {
    border-color: var(--bricks-primary);
    background-color: var(--bricks-primary);
    color: var(--bricks-base-0);

    &:hover {
        background-color: var(--bricks-primary);
        color: var(--bricks-base-0);
    }
}

.searchInner {
    position: relative;
    display: flex;
    align-items: center;
    border-radius: 0.8rem;
    border: 1px solid var(--bricks-base-300);
    background-color: var(--bricks-base-50);
    transition: border-color var(--default-transition);

    &:hover {
        border-color: var(--bricks-base-400);
    }

    &:focus-within {
        border-color: var(--bricks-primary);
    }
}

.searchIcon {
    position: absolute;
    left: 1rem;
    width: 1.6rem;
    height: 1.6rem;
    color: var(--bricks-base-400);
    pointer-events: none;
}

.searchInput {
    width: 100%;
    padding: 0.8rem 3.2rem 0.8rem 3.2rem;
    border: none;
    background: transparent;
    outline: none;
    font-size: 1.4rem;
    line-height: 1.6rem;
    color: var(--bricks-base-900);

    &::placeholder {
        color: var(--bricks-base-400);
    }
}

.searchClear {
    position: absolute;
    right: 0.4rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.4rem;
    height: 2.4rem;
    border-radius: 0.4rem;
    border: none;
    background: transparent;
    color: var(--bricks-base-400);
    transition: color var(--default-transition);
    cursor: pointer;

    &:hover {
        color: var(--bricks-base-800);
    }

    svg {
        width: 1.4rem;
        height: 1.4rem;
    }
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
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
    color: var(--bricks-base-500);

    p {
        margin: 0.8rem 0;
    }
}

.emptyIcon {
    margin-bottom: 1.6rem;
    color: var(--bricks-base-400);

    svg {
        width: 4.8rem;
        height: 4.8rem;
    }
}

.emptyHint {
    font-size: 1.2rem;
    color: var(--bricks-base-500);

    code {
        padding: 0.2rem 0.6rem;
        border-radius: var(--border-radius-xs);
        background-color: var(--bricks-base-100);
        font-family: monospace;
    }
}
</style>
