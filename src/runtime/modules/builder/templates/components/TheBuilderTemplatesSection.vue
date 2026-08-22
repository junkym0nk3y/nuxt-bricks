<script setup lang="ts">
/**
 * @description The whole "Templates" section: the summary line, the grid, the
 * confirmation of a deletion and the form that edits a caption.
 *
 * A controller component rather than markup inside the dashboard host: the section has
 * state of its own (the busy card, the target of the confirmation, the template being
 * edited) and windows of its own. The host stays the composition root: it shows the
 * toasts, holds the search field in the shared header, opens the creation form and the
 * lightbox of the preview.
 *
 * What goes outward is exactly what does not belong to the section: the texts of the
 * toasts, the request to open the page list (the empty state) and the creation of a
 * page from a template — the creation form lives in the publishing domain, and the
 * section knows nothing about it.
 *
 * Decisions held by the markup: a refused read does not hide the cards already read —
 * they are true as of the previous answer, while an empty screen would report that
 * there are no templates. The grid is not drawn at all when the refusal caught the
 * section with no data: its own empty state would say "no templates yet", whereas in
 * truth nobody knows whether there are any — that is what the strip with the retry
 * button says instead.
 */

// #region Imports
// Types
import type { TBricksTemplateSummary } from '../../../common/types/templates';
import type { ITemplatesSectionProps, ITemplatesSectionEmits } from '../types/templates';

// Utils
import { formatPageDate } from '../../../common/utils/bricks/dates';

// Vue
import { computed, onMounted, ref, toRef } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useTemplateActions } from '../composables/useTemplateActions';
import { useTemplatesData } from '../composables/useTemplatesData';
import { useTemplatesList } from '../composables/useTemplatesList';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksConfirmModal from '../../../ui/feedback/BricksConfirmModal.vue';
import BuilderTemplatesGrid from './BuilderTemplatesGrid.vue';
import TheBuilderTemplatesRenameModal from './TheBuilderTemplatesRenameModal.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<ITemplatesSectionProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<ITemplatesSectionEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const { templates, status, lastSavedAt, ensureTemplates, refreshTemplates } = useTemplatesData();
const { filteredTemplates, isSearchEmpty } = useTemplatesList(
    templates,
    toRef(props, 'searchQuery')
);
const actions = useTemplateActions({
    onNotify: (message, variant) => emit('notify', message, variant),
});

/** The template whose caption is being edited; `null` — the form is closed */
const renameTarget = ref<TBricksTemplateSummary | null>(null);
// #endregion

// #region Computed
const hasAnyTemplates = computed<boolean>(() => templates.value.length > 0);

/**
 * The summary line above the grid: how many templates there are and when the last one
 * was saved. The date is left out for an empty list — there is nothing to report.
 */
const summaryLine = computed<string>(() => {
    if (!hasAnyTemplates.value) {
        return '';
    }

    const count = t('bricks.templates.summary.count', { count: templates.value.length });

    return lastSavedAt.value
        ? `${count} · ${t('bricks.templates.summary.lastSaved', { date: formatPageDate(lastSavedAt.value) })}`
        : count;
});

const isLoading = computed<boolean>(() => status.value === 'loading');
const isFailed = computed<boolean>(() => status.value === 'error');
// #endregion

// #region Methods
/** Repeats the read of the list after a temporary refusal */
async function handleRetry(): Promise<void> {
    await refreshTemplates();
}

/**
 * Opens the form that edits the caption of a template.
 *
 * @param template - The template.
 */
function handleRename(template: TBricksTemplateSummary): void {
    renameTarget.value = template;
}

/** Closes the form that edits the caption */
function handleCloseRename(): void {
    renameTarget.value = null;
}

/**
 * The caption is saved: the form closes and the person is told. The card has already
 * been corrected by the form itself — by the answer of the endpoint, not by a re-read.
 *
 * @param template - The template after the edit.
 */
function handleRenamed(template: TBricksTemplateSummary): void {
    renameTarget.value = null;
    emit('notify', t('bricks.templates.toasts.renamed', { name: template.name }), 'success');
}

/**
 * Asks the host to create a page from a template.
 *
 * @param template - The template.
 */
function handleCreatePage(template: TBricksTemplateSummary): void {
    emit('create-page', template);
}

/**
 * Asks the host to open the frame of a template in the lightbox.
 *
 * @param template - The template.
 */
function handlePreviewThumbnail(template: TBricksTemplateSummary): void {
    emit('preview-thumbnail', template);
}

/** Asks the host to open the section of pages (the empty state) */
function handleGoToPages(): void {
    emit('go-to-pages');
}
// #endregion

// #region Lifecycle
// The list is read on the mounting of the section, and not by the composition root
// alone: the counter of the rail starts that same read, yet the section can also be
// opened in a build without SSR, where the first frame of the dashboard is drawn
// before the answer. A list that is ready is not read again — the guard sits inside
// `ensureTemplates`
onMounted(() => {
    ensureTemplates();
});
// #endregion
</script>

<template>
    <div :class="$style.TheBuilderTemplatesSection">
        <div v-if="summaryLine" :class="$style.summary">{{ summaryLine }}</div>

        <div v-if="isFailed" :class="$style.failure">
            <span :class="$style.failureText">{{ t('bricks.templates.loadFailed') }}</span>
            <BricksButton size="sm" variant="secondary" @click="handleRetry">
                {{ t('bricks.templates.retry') }}
            </BricksButton>
        </div>

        <BuilderTemplatesGrid
            v-if="!isFailed || hasAnyTemplates"
            :templates="filteredTemplates"
            :is-loading="isLoading"
            :has-any-templates="hasAnyTemplates"
            :is-search-empty="isSearchEmpty"
            :pending-template-id="actions.pendingTemplateId.value"
            @create-page="handleCreatePage"
            @preview-thumbnail="handlePreviewThumbnail"
            @rename="handleRename"
            @delete="actions.requestDelete"
            @go-to-pages="handleGoToPages"
        />

        <TheBuilderTemplatesRenameModal
            :is-open="renameTarget !== null"
            :template="renameTarget"
            @close="handleCloseRename"
            @saved="handleRenamed"
        />

        <BricksConfirmModal
            :is-open="actions.isDeleteConfirmOpen.value"
            :title="t('bricks.templates.deleteConfirm.title')"
            :description="actions.deleteConfirmDescription.value"
            :confirm-text="t('bricks.common.delete')"
            confirm-variant="danger"
            :is-loading="actions.isDeleting.value"
            @close="actions.closeDeleteConfirm()"
            @confirm="actions.confirmDelete"
        />
    </div>
</template>

<style module lang="scss">
.TheBuilderTemplatesSection {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 1.6rem;
}

.summary {
    font-size: 1.4rem;
    color: var(--bricks-base-500);
}

.failure {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.2rem;
    padding: 1.2rem 1.6rem;
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid var(--bricks-danger-500);
    background: var(--bricks-danger-50);
}

.failureText {
    font-size: 1.4rem;
    color: var(--bricks-danger-600);
}
</style>
