<script setup lang="ts">
// #region Imports
// Types
import type { IComponentLibraryItem } from '../../../../common/types/brick';
import type { ISidebarComponentsViewProps, ISidebarComponentsViewEmits } from './types';

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
import BricksInput from '../../../../ui/inputs/BricksInput.vue';
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
 * Группирует отфильтрованные компоненты по категориям для отображения.
 *
 * Категории:
 * - 'Layout' - отображаются в grid 2 колонки с высотой миниатюры 12rem
 * - Остальные (Slider, Cards и т.д.) - отображаются в 1 колонку с высотой 18rem
 * - 'Modal' - исключается из отображения (модальные окна не добавляются на канвас)
 *
 * @returns Map, где ключ - название категории, значение - массив компонентов
 */
const categorizedComponents = computed<Map<string, IComponentLibraryItem[]>>(() =>
    groupComponentsByCategory(filteredComponents.value)
);

/**
 * Проверяет наличие компонентов для отображения в библиотеке
 * @returns true если есть хотя бы один компонент
 */
const hasAvailableComponents = computed<boolean>(() => props.components.length > 0);

/**
 * Проверяет, есть ли результаты после фильтрации
 * @returns true если есть хотя бы одна категория с компонентами
 */
const hasFilteredResults = computed<boolean>(() => categorizedComponents.value.size > 0);

/**
 * Имена пропущенных бриков одной строкой — по ним разработчик находит проблему,
 * а пользователь понимает, чего именно недостаёт в списке.
 */
const skippedBrickNames = computed<string>(() =>
    props.skippedBricks.map((brick) => brick.name).join(', ')
);

/**
 * Подсказка про перезапуск нужна только там, где перезапуск и возможен. Всякий
 * пропуск теперь означает рассинхрон манифеста и сборки — библиотека собирается
 * из манифеста и brick-модулей не импортирует, так что упасть на импорте больше
 * нечему.
 */
const isDevHintVisible = computed<boolean>(
    () => import.meta.dev === true && props.skippedBricks.length > 0
);
// #endregion

// #region Methods
/**
 * Эмитит событие закрытия сайдбара для родительского компонента
 */
function handleClose(): void {
    emit('close');
}

/**
 * Переводит название категории: известные категории — через мапу
 * `bricks.library.categories.*`, кастомные строки потребителя — как есть.
 */
function resolveCategoryLabel(category: string): string {
    const key = `bricks.library.categories.${category.toLowerCase()}`;
    return te(key) ? t(key) : category;
}

/**
 * Запрашивает повторную загрузку библиотеки у composition root'а.
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
                <BricksInput
                    :value="searchQuery"
                    type="text"
                    :placeholder="t('bricks.library.searchPlaceholder')"
                    clearable
                    @update:value="(val: string) => (searchQuery = val)"
                >
                    <template #prefix>
                        <BricksIcon icon="ta:outline-search" />
                    </template>
                </BricksInput>
                <button
                    :class="[
                        $style.favoritesToggle,
                        { [$style.favoritesToggleActive]: showFavoritesOnly },
                    ]"
                    type="button"
                    @click="showFavoritesOnly = !showFavoritesOnly"
                >
                    <BricksIcon :icon="showFavoritesOnly ? 'ta:filled-star' : 'ta:outline-star'" />
                </button>
            </div>
        </div>

        <div :class="[$style.content, 'bricks-scrollbox']">
            <!--
                Блок отказа показывается независимо от состава списка: layout-блоки
                в нём остаются и при отказе ручки, поэтому «список непуст» больше
                не означает «библиотека загружена»
            -->
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

            <!--
                Отдельно от блока отказа и без кнопки повтора: ответ ручки дошёл,
                а вот отдельные брики не собрались — повтор их не вернёт. Список
                имён обязателен: без него неясно, чего именно не хватает среди
                оставшихся карточек
            -->
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

            <div v-if="hasAvailableComponents && !hasFilteredResults" :class="$style.empty">
                <span :class="$style.emptyIcon">
                    <BricksIcon icon="ta:outline-search" />
                </span>
                <p>{{ t('bricks.common.notFound') }}</p>
                <p :class="$style.emptyHint">{{ t('bricks.library.emptyHint') }}</p>
            </div>

            <div v-if="!hasAvailableComponents" :class="$style.empty">
                <span :class="$style.emptyIcon">
                    <BricksIcon icon="ta:outline-package" />
                </span>
                <p>{{ t('bricks.library.noComponents') }}</p>
                <p :class="$style.emptyHint">{{ t('bricks.library.noComponentsHint') }}</p>
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
    border-radius: var(--bricks-border-radius-control);
    border: 1px solid var(--bricks-base-300);
    background-color: var(--bricks-base-50);
    color: var(--bricks-base-400);
    transition: all var(--bricks-default-transition);
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
    color: var(--bricks-static-white);

    &:hover {
        background-color: var(--bricks-primary);
        color: var(--bricks-static-white);
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
        border-radius: var(--bricks-border-radius-xs);
        background-color: var(--bricks-base-100);
        font-family: monospace;
    }
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

    /* Длинные имена бриков не должны распирать сайдбар */
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
