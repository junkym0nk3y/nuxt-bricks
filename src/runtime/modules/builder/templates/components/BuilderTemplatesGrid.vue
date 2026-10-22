<script setup lang="ts">
/**
 * @description The grid of templates and its edges: the read, an empty section, an
 * empty search.
 *
 * The empty state of the section leads to the page list instead of showing a disabled
 * button: a template is born on the pages surface — from a row of the list or from the
 * builder of a page, unsaved edits included — and there is nothing here to create one
 * with, so the person needs to be where there is.
 *
 * A decision held by the style section: the minimum of a column is 24rem, which on the
 * 1160 of the content gives four columns of 27.2rem, and on a narrower window three and
 * then two — without breakpoints of its own.
 */

// #region Imports
// Types
import type { TBricksTemplateSummary } from '../../../common/types/templates';
import type { ITemplatesGridProps, ITemplatesGridEmits } from '../types/templates';

// Vue
import { useI18n } from 'vue-i18n';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksEmptyState from '../../../ui/feedback/BricksEmptyState.vue';
import BricksSkeleton from '../../../ui/feedback/BricksSkeleton.vue';
import BuilderTemplatesCard from './BuilderTemplatesCard.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<ITemplatesGridProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<ITemplatesGridEmits>();
// #endregion

// #region Data
const { t } = useI18n();

/**
 * The number of stand-in cards for the duration of the read: exactly one row of the
 * grid at the typical width of the dashboard. The skeleton repeats the card instead of
 * showing a spinner in the middle — that way the layout does not jump at the moment the
 * real cards arrive.
 */
const SKELETON_CARDS = 4;
// #endregion

// #region Methods
/**
 * Passes the creation of a page from a template upwards.
 *
 * @param template - The template.
 */
function handleCreatePage(template: TBricksTemplateSummary): void {
    emit('create-page', template);
}

/**
 * Passes the viewing of the frame of a template upwards.
 *
 * @param template - The template.
 */
function handlePreviewThumbnail(template: TBricksTemplateSummary): void {
    emit('preview-thumbnail', template);
}

/**
 * Passes the edit of a caption upwards.
 *
 * @param template - The template.
 */
function handleRename(template: TBricksTemplateSummary): void {
    emit('rename', template);
}

/**
 * Passes the deletion of a template upwards.
 *
 * @param template - The template.
 */
function handleDelete(template: TBricksTemplateSummary): void {
    emit('delete', template);
}

/** Asks to open the section of pages (the call to action of the empty state) */
function handleGoToPages(): void {
    emit('go-to-pages');
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderTemplatesGrid">
        <div v-if="props.isLoading && !props.hasAnyTemplates" :class="$style.grid">
            <div
                v-for="index in SKELETON_CARDS"
                :key="`skeleton-${index}`"
                :class="$style.skeletonCard"
            >
                <BricksSkeleton shape="block" :class="$style.skeletonThumbnail" />
                <div :class="$style.skeletonMeta">
                    <BricksSkeleton :class="[$style.skeletonLine, $style.skeletonLineWide]" />
                    <BricksSkeleton :class="$style.skeletonLine" />
                </div>
            </div>
        </div>

        <div v-else-if="props.isSearchEmpty" :class="$style.state">
            <BricksEmptyState
                icon="ta:outline-search"
                :title="t('bricks.templates.notFound.title')"
                :description="t('bricks.templates.notFound.description')"
            />
        </div>

        <div v-else-if="!props.hasAnyTemplates" :class="$style.state">
            <BricksEmptyState
                icon="ta:outline-package"
                :title="t('bricks.templates.empty.title')"
                :description="t('bricks.templates.empty.description')"
            >
                <BricksButton size="md" variant="secondary" @click="handleGoToPages">
                    {{ t('bricks.templates.empty.action') }}
                </BricksButton>
            </BricksEmptyState>
        </div>

        <div v-else :class="$style.grid">
            <BuilderTemplatesCard
                v-for="template in props.templates"
                :key="template.id"
                :template="template"
                :is-pending="props.pendingTemplateId === template.id"
                @create-page="handleCreatePage"
                @preview-thumbnail="handlePreviewThumbnail"
                @rename="handleRename"
                @delete="handleDelete"
            />
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderTemplatesGrid {
    display: flex;
    flex: 1;
    flex-direction: column;
}

.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(24rem, 1fr));
    gap: 2.4rem;
}

.state {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    flex-direction: column;
    gap: 0.8rem;
    padding: 2.4rem;
}

.skeletonCard {
    overflow: hidden;
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
}

.skeletonThumbnail {
    aspect-ratio: 16 / 10;
}

.skeletonMeta {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    padding: 1.2rem 1.4rem;
}

.skeletonLine {
    width: 60%;
    height: 1.2rem;
}

.skeletonLineWide {
    width: 80%;
}
</style>
