<script setup lang="ts">
// #region Imports
// Types
import type { TPublishedPageSummary } from '../../../../common/types/bricks-api';
import type {
    IToolbarPageSelectorProps,
    IToolbarPageSelectorEmits,
    IToolbarPageSelectorEmptyState,
} from './types';

// Utils
import { toPageAddress } from '../../../../common/utils/bricks/pageAddress';
import { getPublishedPagePath } from '../../../../common/utils/bricks/routePaths';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Reka UI
import {
    PopoverRoot,
    PopoverTrigger,
    PopoverPortal,
    PopoverContent,
    ListboxRoot,
    ListboxContent,
    ListboxFilter,
    ListboxItem,
} from 'reka-ui';

// Composables
import { useToolbarPageSelector } from '../composables/useToolbarPageSelector';
import { useBuilderPermissions } from '../../../core/composables/useBuilderPermissions';

// Components
import BricksBadge from '../../../../ui/base/badge/BricksBadge.vue';
import BricksEmptyState from '../../../../ui/feedback/BricksEmptyState.vue';
import BricksPopoverSurface from '../../../../ui/base/popover/BricksPopoverSurface.vue';
import BricksSkeleton from '../../../../ui/feedback/BricksSkeleton.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IToolbarPageSelectorProps>(), {
    pageTitle: '',
    currentPageId: null,
    isLoaded: false,
    isLoading: false,
    disabled: false,
    isCreateDisabled: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IToolbarPageSelectorEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const { canEdit } = useBuilderPermissions();

/** Строк в скелете догрузки — столько же, сколько в макете. */
const SKELETON_ROWS = 3;

/** Ключи i18n пустых состояний: ничего не нашлось поиском и страниц нет вовсе. */
const EMPTY_STATE_TEXT: Record<'noResults' | 'empty', IToolbarPageSelectorEmptyState> = {
    noResults: {
        title: 'bricks.toolbar.pageSelector.noResultsTitle',
        description: 'bricks.toolbar.pageSelector.noResultsDescription',
    },
    empty: {
        title: 'bricks.toolbar.pageSelector.emptyTitle',
        description: 'bricks.toolbar.pageSelector.emptyDescription',
    },
};

const { isOpen, searchQuery, isSearchVisible, filteredPages, isEmptyResult, handleOpenChange } =
    useToolbarPageSelector({
        pages: () => props.pages,
    });
// #endregion

// #region Computed
/**
 * Текущая страница как значение listbox. Строкой, потому что id страницы бывает
 * и числом, и строкой, а сравнение значений внутри listbox — по совпадению.
 */
const currentPageValue = computed<string | undefined>(() =>
    props.currentPageId === null || props.currentPageId === undefined
        ? undefined
        : String(props.currentPageId)
);

/**
 * Скелет показывается только до первого полного ответа. Фоновое освежение уже
 * загруженного списка строки не подменяет: подменять готовый список серыми
 * плашками — значит на секунду отбирать у пользователя то, что он открыл.
 */
const isInitialLoading = computed<boolean>(() => props.isLoading && !props.isLoaded);

/** Список пуст по-настоящему: ответ пришёл, страниц нет, поиск ни при чём. */
const isEmptyList = computed<boolean>(
    () => !isInitialLoading.value && props.pages.length === 0 && !searchQuery.value
);

/**
 * Тексты пустого состояния или `null`, когда показывать нечего. Одна разметка на
 * оба случая: у них расходятся только строки, а копия блока разъезжается при
 * первой же правке вёрстки.
 */
const emptyState = computed<IToolbarPageSelectorEmptyState | null>(() => {
    if (isEmptyResult.value) {
        return EMPTY_STATE_TEXT.noResults;
    }

    if (isEmptyList.value) {
        return EMPTY_STATE_TEXT.empty;
    }

    return null;
});
// #endregion

// #region Methods
/**
 * Live-адрес страницы для строки списка (`/blog/post`).
 *
 * Полный адрес, а не один `pagename`: имя уникально только внутри своего
 * префикса, и две одноимённые страницы под разными префиксами были бы в списке
 * неразличимы — выбрать нужную нельзя.
 *
 * @param page - Сводка страницы.
 * @returns Путь live-адреса.
 */
function resolvePageAddressPath(page: TPublishedPageSummary): string {
    return getPublishedPagePath(toPageAddress(page.pagename, page.urlPrefix));
}

/**
 * Открывает и закрывает попап; на открытии сообщает наружу — это момент, когда
 * список догружается и освежается.
 *
 * @param nextOpen - Новое состояние попапа.
 */
function handleOpenUpdate(nextOpen: boolean): void {
    handleOpenChange(nextOpen);

    if (nextOpen) {
        emit('open');
    }
}

/**
 * Выбирает страницу.
 *
 * Событие берётся у самой строки, а не у `update:modelValue` списка: повторный
 * выбор уже выбранного значения список не пересылает, и клик по текущей странице
 * оставил бы попап открытым — то есть выглядел бы как сломанная кнопка. Что
 * делать с выбором текущей страницы, решает уже родитель.
 *
 * @param page - Выбранная страница.
 */
function handleSelect(page: TPublishedPageSummary): void {
    handleOpenChange(false);
    emit('select', page);
}

/**
 * Держит клавиатуру внутри попапа: горячие клавиши билдера висят на window и
 * пропускают только поля ввода, поэтому Delete на строке списка или кнопке
 * футера удалил бы выбранный компонент канваса за порталом.
 *
 * Escape — исключение: попап закрывается обработчиком на document, и заглушённое
 * событие до него не доходит, то есть окно переставало закрываться с клавиатуры.
 *
 * @param event - Событие клавиатуры внутри попапа.
 */
function handleContentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        return;
    }

    event.stopPropagation();
}

/**
 * Уводит на дашборд страниц.
 */
function handleAllPages(): void {
    handleOpenChange(false);
    emit('allPages');
}

/**
 * Открывает создание новой страницы.
 */
function handleCreatePage(): void {
    handleOpenChange(false);
    emit('createPage');
}
// #endregion
</script>

<template>
    <PopoverRoot :open="isOpen" @update:open="handleOpenUpdate">
        <PopoverTrigger as-child>
            <button
                :class="[$style.trigger, isOpen && $style.triggerOpened]"
                type="button"
                :disabled="props.disabled"
                :aria-label="t('bricks.toolbar.pageSelector.ariaLabel')"
            >
                <span :class="$style.triggerTitle">{{ props.pageTitle }}</span>
                <BricksIcon
                    :class="$style.triggerChevron"
                    :icon="isOpen ? 'ta:outline-chevron-up' : 'ta:outline-chevron-down'"
                />
            </button>
        </PopoverTrigger>

        <PopoverPortal>
            <!--
                Поповер немодальный: Esc и возврат фокуса на триггер даёт сам
                PopoverContent, focus trap появился бы только от `modal` на
                PopoverRoot — а он же гасит `pointer-events` у body, пока попап
                смонтирован, и клик сразу после закрытия пропадал бы.
                Перехват клавиатуры — в `handleContentKeydown`
            -->
            <PopoverContent as-child align="start" :side-offset="8" @keydown="handleContentKeydown">
                <BricksPopoverSurface density="flush" :class="[$style.dropdown, 'bricks-text']">
                    <!--
                    Поиск живёт внутри списка (ListboxFilter), а не отдельным
                    полем над ним: так стрелки и Enter из поля ведут по строкам
                    штатно, без своей эмуляции фокуса
                -->
                    <ListboxRoot
                        :model-value="currentPageValue"
                        selection-behavior="replace"
                        :class="$style.listbox"
                    >
                        <div v-if="isSearchVisible" :class="$style.search">
                            <BricksIcon :class="$style.searchIcon" icon="ta:outline-search" />
                            <ListboxFilter
                                v-model="searchQuery"
                                :class="$style.searchInput"
                                :placeholder="t('bricks.toolbar.pageSelector.search')"
                                :aria-label="t('bricks.toolbar.pageSelector.search')"
                                auto-focus
                            />
                        </div>

                        <div
                            v-if="isInitialLoading"
                            :class="$style.skeleton"
                            role="status"
                            :aria-label="t('bricks.toolbar.pageSelector.loading')"
                        >
                            <div
                                v-for="row in SKELETON_ROWS"
                                :key="row"
                                :class="$style.skeletonRow"
                            >
                                <BricksSkeleton shape="block" :class="$style.skeletonThumbnail" />
                                <span :class="$style.skeletonLines" aria-hidden="true">
                                    <BricksSkeleton :class="$style.skeletonLine" />
                                    <BricksSkeleton
                                        :class="[$style.skeletonLine, $style.skeletonLineShort]"
                                    />
                                </span>
                            </div>
                        </div>

                        <BricksEmptyState
                            v-else-if="emptyState"
                            :class="$style.empty"
                            size="sm"
                            :title="t(emptyState.title)"
                            :description="t(emptyState.description)"
                        />

                        <ListboxContent v-else class="bricks-scrollbox" :class="$style.list">
                            <ListboxItem
                                v-for="page in filteredPages"
                                :key="String(page.id)"
                                :class="[
                                    $style.row,
                                    String(page.id) === currentPageValue && $style.rowCurrent,
                                ]"
                                :value="String(page.id)"
                                @select="handleSelect(page)"
                            >
                                <img
                                    v-if="page.thumbnailUrl"
                                    :class="$style.thumbnail"
                                    :src="page.thumbnailUrl"
                                    alt=""
                                    loading="lazy"
                                />
                                <span v-else :class="[$style.thumbnail, $style.thumbnailEmpty]">
                                    <BricksIcon
                                        :class="$style.thumbnailIcon"
                                        icon="ta:outline-photo"
                                    />
                                </span>

                                <span :class="$style.rowMain">
                                    <span :class="$style.rowTitleLine">
                                        <span :class="$style.rowTitle">
                                            {{ page.title || page.pagename }}
                                        </span>
                                        <BricksBadge v-if="!page.published">
                                            {{ t('bricks.toolbar.pageSelector.draft') }}
                                        </BricksBadge>
                                    </span>
                                    <span :class="$style.rowUrl">
                                        {{ resolvePageAddressPath(page) }}
                                    </span>
                                </span>

                                <BricksIcon
                                    v-if="String(page.id) === currentPageValue"
                                    :class="$style.rowCheck"
                                    icon="ta:outline-check"
                                    aria-hidden="true"
                                />
                            </ListboxItem>
                        </ListboxContent>
                    </ListboxRoot>

                    <div :class="$style.footer">
                        <button :class="$style.footerAction" type="button" @click="handleAllPages">
                            <BricksIcon :class="$style.footerIcon" icon="ta:outline-files" />
                            {{ t('bricks.toolbar.pageSelector.allPages') }}
                        </button>

                        <!-- Создание страницы — запись: наблюдателю ручка откажет -->
                        <button
                            v-if="canEdit"
                            :class="$style.footerAction"
                            type="button"
                            :disabled="props.isCreateDisabled"
                            @click="handleCreatePage"
                        >
                            <BricksIcon :class="$style.footerIcon" icon="ta:outline-plus" />
                            {{ t('bricks.toolbar.pageSelector.createPage') }}
                        </button>
                    </div>
                </BricksPopoverSurface>
            </PopoverContent>
        </PopoverPortal>
    </PopoverRoot>
</template>

<style module lang="scss">
.trigger {
    display: inline-flex;
    align-items: center;
    max-width: 32rem;
    padding: 0.4rem 0.8rem;
    border-radius: var(--bricks-border-radius-control);
    border: none;
    background: transparent;
    font-size: 1.8rem;
    font-weight: 500;
    color: var(--bricks-base-900);
    transition: background-color var(--bricks-default-transition);
    cursor: pointer;
    gap: 0.6rem;

    &:hover:not(:disabled) {
        background: var(--bricks-base-100);
    }

    &:disabled {
        opacity: 0.6;
        cursor: default;
    }
}

.triggerOpened {
    background: var(--bricks-base-100);
}

.triggerTitle {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.triggerChevron {
    flex-shrink: 0;
    font-size: 1.6rem;
    color: var(--bricks-base-500);
}

.dropdown {
    display: flex;
    width: 32rem;
    flex-direction: column;

    // Появление — как у остальных поповеров билдера (BricksActionButton).
    &[data-state='open'] {
        animation: bricks-page-selector-in 0.2s ease;
    }

    // Затухание короче появления: reka не размонтирует контент, пока не
    // отработает анимация closed-состояния, и всё это время попап ещё висит
    // над канвасом. `pointer-events: none` — чтобы клик по тому, что было под
    // попапом, не съедался уходящим окном
    &[data-state='closed'] {
        animation: bricks-page-selector-out 0.15s ease;
        pointer-events: none;
    }

    @media (prefers-reduced-motion: reduce) {
        &[data-state='open'],
        &[data-state='closed'] {
            animation: none;
        }
    }
}

// Keyframes — внутри module-блока: CSS Modules скоупит имя анимации в ссылке
// `animation:` выше, и глобальное определение с ним не совпало бы
@keyframes bricks-page-selector-in {
    from {
        opacity: 0;
        transform: translateY(-0.4rem);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes bricks-page-selector-out {
    from {
        opacity: 1;
        transform: translateY(0);
    }

    to {
        opacity: 0;
        transform: translateY(-0.4rem);
    }
}

.listbox {
    display: flex;
    flex-direction: column;
    min-height: 0;
}

.search {
    position: relative;
    display: flex;
    align-items: center;
    padding: 0.8rem 0.8rem 0;
}

.searchIcon {
    position: absolute;
    left: 1.8rem;
    font-size: 1.6rem;
    color: var(--bricks-base-400);
    pointer-events: none;
}

.searchInput {
    width: 100%;
    height: 3.6rem;
    padding: 0 1.2rem 0 3.6rem;
    border-radius: var(--bricks-border-radius-xs);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    font-size: 1.4rem;
    color: var(--bricks-base-900);
    transition: border-color var(--bricks-default-transition);

    &::placeholder {
        color: var(--bricks-base-400);
    }

    &:focus {
        border-color: var(--bricks-primary);
        outline: none;
    }
}

.list {
    overflow-y: auto;
    display: flex;

    // Потолок в 5,5 строки: половина шестой видна и сама говорит, что список
    // продолжается ниже
    max-height: 28.8rem;
    padding: 0.8rem;
    flex-direction: column;
    gap: 0.2rem;
}

.row {
    display: flex;
    align-items: center;

    // flex-shrink: 0 обязателен: как только список перерастает свой потолок,
    // флексбокс начинает сжимать строки, и название с адресом налезают друг на
    // друга — тем заметнее, чем больше страниц
    flex-shrink: 0;
    height: 5rem;
    padding: 0 0.8rem;
    border-radius: var(--bricks-border-radius-xs);
    transition: background-color var(--bricks-default-transition);
    cursor: pointer;
    gap: 1rem;

    /* Тот же фон наведения, что у пунктов меню в ките (`BricksMenuItem`): у одной
       роли было три значения — `base-50`, `base-100` и `surface-raised`, причём
       последние два — один и тот же цвет под разными именами. */
    &:hover,
    &[data-highlighted] {
        background: var(--bricks-base-50);
    }

    &:focus-visible {
        outline: none;
        box-shadow: var(--bricks-shadow-focus);
    }
}

.rowCurrent {
    background: var(--bricks-primary-50);

    &:hover,
    &[data-highlighted] {
        background: var(--bricks-primary-50);
    }

    .rowTitle {
        color: var(--bricks-primary);
    }
}

.thumbnail {
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 4.8rem;
    height: 3rem;
    border-radius: var(--bricks-border-radius-xs);
    border: 1px solid var(--bricks-base-200);
    object-fit: cover;
    object-position: top;
}

.thumbnailEmpty {
    background: var(--bricks-base-100);
}

.thumbnailIcon {
    font-size: 1.6rem;
    color: var(--bricks-base-400);
}

.rowMain {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
}

.rowTitleLine {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 0;
}

.rowTitle {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.4rem;
    font-weight: 500;
    color: var(--bricks-base-900);
}

.rowUrl {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.2rem;
    color: var(--bricks-base-400);
}

.rowCheck {
    flex-shrink: 0;
    font-size: 1.6rem;
    color: var(--bricks-primary);
}

.skeleton {
    display: flex;
    padding: 0.8rem;
    flex-direction: column;
    gap: 0.2rem;
}

.skeletonRow {
    display: flex;
    align-items: center;
    height: 5rem;
    padding: 0 0.8rem;
    gap: 1rem;
}

.skeletonThumbnail {
    flex-shrink: 0;
    width: 4.8rem;
    height: 3rem;
}

.skeletonLines {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 0.6rem;
}

.skeletonLine {
    width: 100%;
    height: 1rem;
}

.skeletonLineShort {
    width: 40%;
}

/* Отступы состояния задаёт попап: список в нём идёт без внешних полей. */
.empty {
    padding: 3.2rem 1.6rem;
}

.footer {
    display: flex;
    padding: 0.8rem;
    border-top: 1px solid var(--bricks-base-200);
    flex-direction: column;
    gap: 0.2rem;
}

.footerAction {
    display: flex;
    align-items: center;
    height: 3.6rem;
    padding: 0 0.8rem;
    border-radius: var(--bricks-border-radius-xs);
    border: none;
    background: transparent;
    font-size: 1.4rem;
    color: var(--bricks-base-900);
    transition: background-color var(--bricks-default-transition);
    cursor: pointer;
    gap: 0.8rem;

    &:hover:not(:disabled) {
        background: var(--bricks-base-100);
    }

    &:focus-visible {
        outline: none;
        box-shadow: var(--bricks-shadow-focus);
    }

    &:disabled {
        opacity: 0.5;
        cursor: default;
    }
}

.footerIcon {
    flex-shrink: 0;
    font-size: 1.6rem;
    color: var(--bricks-base-500);
}
</style>
