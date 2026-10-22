<script setup lang="ts">
/**
 * @description The list a template for a new page is picked from: a row with the frame,
 * the name and the size.
 *
 * It is shown by a click on the "From a template" card in the creation form — the way
 * the file dialog belongs to the "From a JSON file" card: the "from a template" choice
 * means nothing without a template.
 *
 * A decision held by the style section: the height of the list is capped, because the
 * list lives inside the creation modal and must not grow at that modal's expense. What
 * the cap makes of the search is written down at the threshold itself.
 */

// #region Imports
// Types
import type { TBricksTemplateSummary } from '../../../common/types/templates';
import type { ITemplatesPickerListProps, ITemplatesPickerListEmits } from '../types/templates';

// Utils
import { buildTemplateMetaLine } from '../utils/templateSummary';

// Vue
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BricksSearchInput from '../../../ui/inputs/BricksSearchInput.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<ITemplatesPickerListProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<ITemplatesPickerListEmits>();
// #endregion

// #region Data
/**
 * The number of templates the search appears from: below it the field would be one
 * extra element above a list that scrolling alone still covers — the same reasoning as
 * for the page selector of the toolbar (`SEARCH_VISIBLE_FROM_PAGES`).
 *
 * Tied to the height ceiling of the list: a row is 5.2rem against a ceiling of 28rem,
 * so five rows are shown whole and the sixth template is the first one to need
 * scrolling. A higher threshold left a list that already scrolled with no way to search
 * it, so the two numbers move together — changing the ceiling means changing this one.
 */
const TEMPLATE_PICKER_SEARCH_THRESHOLD = 6;

const { t } = useI18n();

/**
 * The search inside the list is its own, not the one from the dashboard header: the
 * creation form opens on top of the page list, and a query from the header would be
 * filtering the pages there.
 */
const searchQuery = ref('');
// #endregion

// #region Computed
const isSearchVisible = computed<boolean>(
    () => props.templates.length >= TEMPLATE_PICKER_SEARCH_THRESHOLD
);

const visibleTemplates = computed<TBricksTemplateSummary[]>(() => {
    const query = searchQuery.value.trim().toLowerCase();

    if (!query) {
        return props.templates;
    }

    return props.templates.filter((template) =>
        [template.name, template.description]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(query)
    );
});
// #endregion

// #region Methods
/**
 * Builds the meta line of a template through the shared helper: the row of the picker
 * captions a template the same way its card in the section does.
 *
 * @param template - The template.
 * @returns A line of the "12 blocks · 14.08.2026" kind.
 */
function buildMetaLine(template: TBricksTemplateSummary): string {
    return buildTemplateMetaLine(template, (key, params) => t(key, params ?? {}));
}

/**
 * Reports that a template has been picked.
 *
 * @param template - The template.
 */
function handleSelect(template: TBricksTemplateSummary): void {
    emit('select', template);
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderTemplatesPickerList">
        <BricksSearchInput
            v-if="isSearchVisible"
            :class="$style.search"
            :value="searchQuery"
            :placeholder="t('bricks.publish.dashboard.search.templates')"
            @update:value="(value: string) => (searchQuery = value)"
        />

        <p v-if="props.isLoading" :class="$style.state">{{ t('bricks.common.loading') }}</p>

        <p v-else-if="props.templates.length === 0" :class="$style.state">
            {{ t('bricks.templates.picker.empty') }}
        </p>

        <p v-else-if="visibleTemplates.length === 0" :class="$style.state">
            {{ t('bricks.common.notFound') }}
        </p>

        <ul v-else :class="$style.list">
            <li v-for="template in visibleTemplates" :key="template.id">
                <button
                    :class="[
                        $style.row,
                        props.selectedTemplateId === template.id && $style._selected,
                    ]"
                    type="button"
                    :aria-pressed="props.selectedTemplateId === template.id"
                    @click="handleSelect(template)"
                >
                    <span :class="$style.thumbnail">
                        <img
                            v-if="template.thumbnailUrl"
                            :class="$style.thumbnailImage"
                            :src="template.thumbnailUrl"
                            :alt="template.name"
                            loading="lazy"
                        />
                        <BricksIcon
                            v-else
                            icon="ta:outline-photo"
                            :class="$style.thumbnailPlaceholder"
                        />
                    </span>
                    <span :class="$style.text">
                        <span :class="$style.name">{{ template.name }}</span>
                        <span :class="$style.meta">{{ buildMetaLine(template) }}</span>
                    </span>
                </button>
            </li>
        </ul>
    </div>
</template>

<style module lang="scss">
.BuilderTemplatesPickerList {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
}

.search {
    width: 100%;
}

.list {
    overflow-y: auto;
    max-height: 28rem;
    margin: 0;
    padding: 0;
    list-style: none;
}

.row {
    display: flex;
    align-items: center;
    gap: 1.2rem;
    width: 100%;
    padding: 0.8rem 1rem;
    border-radius: var(--bricks-border-radius-xs);
    border: none;
    background: transparent;
    text-align: left;
    transition: background-color var(--bricks-default-transition);
    cursor: pointer;

    &:hover {
        background: var(--bricks-base-50);
    }
}

._selected {
    background: var(--bricks-primary-50);
}

.thumbnail {
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 5.6rem;
    height: 3.6rem;
    border-radius: var(--bricks-border-radius-xs);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-100);
}

.thumbnailImage {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top;
}

.thumbnailPlaceholder {
    font-size: 1.4rem;
    color: var(--bricks-base-400);
}

.text {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
}

.name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.4rem;
    font-weight: 500;
    color: var(--bricks-base-900);
}

.meta {
    font-size: 1.2rem;
    color: var(--bricks-text-muted);
}

.state {
    margin: 0;
    padding: 1.2rem 1rem;
    font-size: 1.2rem;
    color: var(--bricks-base-500);
}
</style>
