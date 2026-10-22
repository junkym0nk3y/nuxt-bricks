<script setup lang="ts">
/**
 * @description Selector of the open page in the toolbar title: a popover listing the
 * saved pages, a search over them, and a footer leading either to the dashboard or to
 * a new page.
 *
 * The popover is deliberately non-modal: Esc and the return of focus to the trigger
 * come from PopoverContent itself, while a focus trap would only arrive together with
 * `modal` on PopoverRoot — and that also kills `pointer-events` on body for as long
 * as the popup stays mounted, so a click right after closing would be swallowed.
 * Keyboard events are kept inside by `handleContentKeydown` instead. The search lives
 * inside the list (`ListboxFilter`) rather than in a separate field above it: arrows
 * and Enter then walk the rows out of the box, with no focus emulation of our own.
 *
 * Decisions held by the style section: the list is capped at 5.5 rows, so half of the
 * sixth says by itself that it continues below; the rows carry `flex-shrink: 0`,
 * because past that cap the flexbox starts squeezing them and the title runs into the
 * address; the closing animation is shorter than the opening one and switches
 * `pointer-events` off, because reka keeps the content mounted until the closed-state
 * animation is over and the leaving popup would eat a click aimed at what was under
 * it; and the keyframes are declared inside the module block, because CSS Modules
 * scopes the animation name at the `animation:` reference and a global definition
 * would no longer match it.
 *
 * Tones are borrowed rather than invented here: the row hover is the one of the kit
 * menu item (`BricksMenuItem`, which carries the story of that tone), the opening
 * animation repeats the other builder popovers (`BricksActionButton`), and the draft
 * badge repeats the one in the dashboard page list.
 */

// #region Imports
// Types
import type { TPublishedPageSummary } from '../../../../common/types/bricks-api';
import type {
    IToolbarPageSelectorProps,
    IToolbarPageSelectorEmits,
    IToolbarPageSelectorEmptyState,
} from '../types/components';

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
// Creating a page is a write: the endpoint would turn a viewer down anyway
const { canEdit } = useBuilderPermissions();

/** Rows in the loading skeleton — as many as the design has */
const SKELETON_ROWS = 3;

/** i18n keys of the empty states: the search found nothing, and there are no pages at all */
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
 * The open page as a listbox value. A string, because a page id comes both as a
 * number and as a string, while the listbox compares its values by equality.
 */
const currentPageValue = computed<string | undefined>(() =>
    props.currentPageId === null || props.currentPageId === undefined
        ? undefined
        : String(props.currentPageId)
);

/**
 * The skeleton is shown up to the first complete answer only. A background refresh of
 * an already loaded list does not replace its rows: swapping a ready list for gray
 * plates means taking away, for a second, exactly what the user came to look at.
 */
const isInitialLoading = computed<boolean>(() => props.isLoading && !props.isLoaded);

/** The list is empty for real: the answer arrived, there are no pages, and no search is involved */
const isEmptyList = computed<boolean>(
    () => !isInitialLoading.value && props.pages.length === 0 && !searchQuery.value
);

/**
 * Texts of the empty state, or `null` when there is nothing to show. Both cases share
 * one markup: a copy of the block would drift apart at the first edit of the layout.
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
 * Live address of the page for a list row (`/blog/post`).
 *
 * The full address, not the `pagename` alone: a name is unique only within its own
 * prefix, so two same-named pages under different prefixes would be indistinguishable
 * in the list — there would be no way to pick the right one.
 *
 * @param page - Page summary.
 * @returns Path of the live address.
 */
function resolvePageAddressPath(page: TPublishedPageSummary): string {
    return getPublishedPagePath(toPageAddress(page.pagename, page.urlPrefix));
}

/**
 * Opens and closes the popup; on opening it reports outwards — that is the moment the
 * list is fetched and refreshed.
 *
 * @param nextOpen - New state of the popup.
 */
function handleOpenUpdate(nextOpen: boolean): void {
    handleOpenChange(nextOpen);

    if (nextOpen) {
        emit('open');
    }
}

/**
 * Picks a page.
 *
 * The event is taken from the row itself rather than from `update:modelValue` of the
 * list: the list does not forward a repeated pick of the already selected value, so a
 * click on the current page would leave the popup open — that is, would look like a
 * broken button. What to do with a pick of the current page is up to the parent.
 *
 * @param page - Picked page.
 */
function handleSelect(page: TPublishedPageSummary): void {
    handleOpenChange(false);
    emit('select', page);
}

/**
 * Keeps the keyboard inside the popup: the builder shortcuts hang on window and let
 * only input fields through, so Delete on a list row or on a footer button would
 * delete the selected canvas component behind the portal.
 *
 * Escape is the exception: the popup is closed by a handler on document, and a
 * stopped event never reaches it — the window stopped closing from the keyboard.
 *
 * @param event - Keyboard event inside the popup.
 */
function handleContentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        return;
    }

    event.stopPropagation();
}

/**
 * Leaves for the page dashboard.
 */
function handleAllPages(): void {
    handleOpenChange(false);
    emit('allPages');
}

/**
 * Asks for a new page to be created.
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
                :aria-label="t('bricks.toolbar.pageSelector.ariaLabel', { title: props.pageTitle })"
            >
                <span :class="$style.triggerTitle">{{ props.pageTitle }}</span>
                <BricksIcon
                    :class="$style.triggerChevron"
                    :icon="isOpen ? 'ta:outline-chevron-up' : 'ta:outline-chevron-down'"
                />
            </button>
        </PopoverTrigger>

        <PopoverPortal>
            <PopoverContent as-child align="start" :side-offset="8" @keydown="handleContentKeydown">
                <BricksPopoverSurface density="flush" :class="[$style.dropdown, 'bricks-text']">
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
                                        <BricksBadge v-if="!page.published" tone="muted">
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

    &[data-state='open'] {
        animation: bricks-page-selector-in 0.2s ease;
    }

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
        color: var(--bricks-text-muted);
    }

    &:focus {
        border-color: var(--bricks-primary);
        outline: none;
    }
}

.list {
    overflow-y: auto;
    display: flex;
    max-height: 28.8rem;
    padding: 0.8rem;
    flex-direction: column;
    gap: 0.2rem;
}

.row {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    height: 5rem;
    padding: 0 0.8rem;
    border-radius: var(--bricks-border-radius-xs);
    transition: background-color var(--bricks-default-transition);
    cursor: pointer;
    gap: 1rem;

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
    color: var(--bricks-text-muted);
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
