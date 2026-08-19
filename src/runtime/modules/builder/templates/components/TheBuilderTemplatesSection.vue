<script setup lang="ts">
/**
 * @description Раздел «Шаблоны» целиком: строка-сводка, сетка, подтверждение
 * удаления и форма правки подписи.
 *
 * Компонент-контроллер, а не разметка внутри хоста дашборда: у раздела своё
 * состояние (занятая карточка, цель подтверждения, правимый шаблон) и свои окна.
 * Хост остаётся composition root — он показывает тосты, держит поле поиска в
 * общей шапке, открывает форму создания страницы и лайтбокс превью.
 *
 * Наружу уходит ровно то, что разделу не принадлежит: тексты тостов, просьба
 * открыть раздел страниц (пустое состояние) и создание страницы из шаблона —
 * форма создания живёт в домене публикации, и раздел о ней не знает.
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

/** Шаблон, чью подпись правят; `null` — форма закрыта. */
const renameTarget = ref<TBricksTemplateSummary | null>(null);
// #endregion

// #region Computed
const hasAnyTemplates = computed<boolean>(() => templates.value.length > 0);

/**
 * Строка-сводка над сеткой: сколько шаблонов и когда сохранён последний. Дата
 * опускается у пустого списка — сообщать не о чем.
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
/**
 * Повторяет чтение списка после временного отказа.
 */
async function handleRetry(): Promise<void> {
    await refreshTemplates();
}

/**
 * Открывает форму правки подписи шаблона.
 *
 * @param template - Шаблон.
 */
function handleRename(template: TBricksTemplateSummary): void {
    renameTarget.value = template;
}

/**
 * Закрывает форму правки подписи.
 */
function handleCloseRename(): void {
    renameTarget.value = null;
}

/**
 * Подпись сохранена: закрываем форму и сообщаем. Карточку уже поправила сама
 * форма — ответом ручки, а не повторным чтением.
 *
 * @param template - Шаблон после правки.
 */
function handleRenamed(template: TBricksTemplateSummary): void {
    renameTarget.value = null;
    emit('notify', t('bricks.templates.toasts.renamed', { name: template.name }), 'success');
}

/**
 * Просит хост создать страницу из шаблона.
 *
 * @param template - Шаблон.
 */
function handleCreatePage(template: TBricksTemplateSummary): void {
    emit('create-page', template);
}

/**
 * Просит хост открыть снимок шаблона в лайтбоксе.
 *
 * @param template - Шаблон.
 */
function handlePreviewThumbnail(template: TBricksTemplateSummary): void {
    emit('preview-thumbnail', template);
}

/**
 * Просит хост открыть раздел страниц (пустое состояние).
 */
function handleGoToPages(): void {
    emit('go-to-pages');
}
// #endregion

// #region Lifecycle
// Список читается при монтировании раздела, а не только composition root'ом:
// счётчик рейла запускает то же чтение, но раздел может открыться и в сборке без
// SSR, где первый кадр дашборда рисуется до ответа. Готовый список повторно не
// читается — гард внутри `ensureTemplates`
onMounted(() => {
    ensureTemplates();
});
// #endregion
</script>

<template>
    <div :class="$style.TheBuilderTemplatesSection">
        <div v-if="summaryLine" :class="$style.summary">{{ summaryLine }}</div>

        <!--
            Отказ чтения не прячет уже прочитанные карточки: они верны на момент
            прошлого ответа, а пустой экран сообщил бы, что шаблонов нет
        -->
        <div v-if="isFailed" :class="$style.failure">
            <span :class="$style.failureText">{{ t('bricks.templates.loadFailed') }}</span>
            <BricksButton size="sm" variant="secondary" @click="handleRetry">
                {{ t('bricks.templates.retry') }}
            </BricksButton>
        </div>

        <!--
            Сетка не рисуется, когда отказ чтения застал раздел без данных: её
            пустое состояние сказало бы «шаблонов пока нет», а на деле неизвестно,
            есть они или нет — об этом говорит полоса выше
        -->
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
