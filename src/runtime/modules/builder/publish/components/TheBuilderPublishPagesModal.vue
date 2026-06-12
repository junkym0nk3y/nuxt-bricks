<script setup lang="ts">
// #region Imports
// Types
import type { IPublishedPagesModalProps, IPublishedPagesModalEmits } from '../types/modal';
import type { IPublishedPage } from '../../../common/types/bricks-api';

// Vue
import { ref, computed, watch } from 'vue';

// Components
import BuilderPublishPageCard from './BuilderPublishPageCard.vue';
import BricksConfirmModal from '../../../ui/feedback/BricksConfirmModal.vue';
import BricksCloseButton from '../../../ui/base/modal/BricksCloseButton.vue';
import BricksModal from '../../../ui/base/modal/BricksModal.vue';

// Pinia
import { usePublishStore } from '../stores/publish';
// #endregion

// #region Props
const props = defineProps<IPublishedPagesModalProps>();
// #endregion

// #region Emits
const emit = defineEmits<IPublishedPagesModalEmits>();
// #endregion

// #region Data
const publishStore = usePublishStore();
const pages = ref<IPublishedPage[]>([]);
const loading = ref(false);
const isDeleteConfirmationOpen = ref(false);
const pendingDeletePageId = ref<string | null>(null);
const isDeleting = ref(false);
const publishingStateById = ref<Record<string, boolean>>({});
// #endregion

// #region Computed
const publishedPages = computed(() => pages.value);
const pendingDeletePage = computed(() => {
    const pageId = pendingDeletePageId.value;
    if (!pageId) {
        return null;
    }

    return (
        publishStore.getPageById(pageId) ?? pages.value.find((item) => String(item.id) === pageId)
    );
});
const deleteConfirmationDescription = computed(() => {
    const page = pendingDeletePage.value;
    if (!page) {
        return 'Вы уверены, что хотите удалить эту страницу?';
    }

    return `Вы уверены, что хотите удалить страницу «${page.title}» (/bricks/${page.pagename})?`;
});
// #endregion

// #region Methods
/**
 * Загружает опубликованные страницы из API.
 */
async function fetchPages(): Promise<void> {
    loading.value = true;
    try {
        await publishStore.loadAllPages();
        pages.value = [...publishStore.publishedPages];
    } catch (error: unknown) {
        const errorMessage =
            (error as { data?: { message?: string } }).data?.message ||
            (error instanceof Error
                ? error.message
                : 'Не удалось загрузить опубликованные страницы');
        const message = `GET /api/bricks: ${errorMessage}`;
        console.error('[PublishedPagesModal] Failed to load pages:', error);
        pages.value = [];
        publishStore.publishedPages = [];
        emit('error', message);
    } finally {
        loading.value = false;
    }
}

/**
 * Обрабатывает действие редактирования страницы.
 *
 * @param pageId - Идентификатор страницы для редактирования.
 */
function handleEdit(pageId: string): void {
    emit('edit', pageId);
}

/**
 * Открывает превью страницы в новой вкладке.
 *
 * @param pageId - Идентификатор страницы для превью.
 */
function handlePreview(pageId: string): void {
    const page =
        publishStore.getPageById(pageId) ??
        pages.value.find((item) => String(item.id) === String(pageId));
    if (page) {
        window.open(publishStore.generatePreviewUrl(page.pagename), '_blank');
    }
}

/**
 * Переключает статус публикации страницы и обновляет список.
 *
 * @param pageId - Идентификатор страницы.
 * @param published - Новый флаг публикации.
 */
async function handleTogglePublished(pageId: string, published: boolean): Promise<void> {
    const normalizedId = String(pageId);
    if (publishingStateById.value[normalizedId] === true) {
        return;
    }

    const index = pages.value.findIndex((item) => String(item.id) === normalizedId);
    if (index === -1) {
        return;
    }

    const previousPublished = Boolean(pages.value[index]?.published);

    publishingStateById.value = {
        ...publishingStateById.value,
        [normalizedId]: true,
    };

    pages.value.splice(index, 1, {
        ...pages.value[index],
        published,
    });

    try {
        const updatedPage = await publishStore.patchPage(normalizedId, { published });
        pages.value.splice(index, 1, updatedPage);

        if (
            publishStore.editingPageId !== null &&
            String(publishStore.editingPageId) === normalizedId
        ) {
            publishStore.setCurrentFormField('published', published);
        }
    } catch (error: unknown) {
        pages.value.splice(index, 1, {
            ...pages.value[index],
            published: previousPublished,
        });

        const errorMessage =
            error instanceof Error ? error.message : 'Не удалось изменить статус публикации';
        emit('error', errorMessage);
    } finally {
        publishingStateById.value = {
            ...publishingStateById.value,
            [normalizedId]: false,
        };
    }
}

/**
 * Удаляет опубликованную страницу.
 *
 * @param pageId - Идентификатор страницы для удаления.
 */
function handleDelete(pageId: string): void {
    pendingDeletePageId.value = String(pageId);
    isDeleteConfirmationOpen.value = true;
}

/**
 * Закрывает подтверждение удаления.
 */
function handleCloseDeleteConfirmation(force = false): void {
    if (!force && isDeleting.value) {
        return;
    }

    isDeleteConfirmationOpen.value = false;
    pendingDeletePageId.value = null;
}

/**
 * Подтверждает и выполняет удаление страницы.
 */
async function handleConfirmDelete(): Promise<void> {
    const pageId = pendingDeletePageId.value;
    if (!pageId) {
        return;
    }

    isDeleting.value = true;
    try {
        await publishStore.deletePage(Number(pageId));
        await fetchPages();
        emit('delete', pageId);
        handleCloseDeleteConfirmation(true);
    } catch (error: unknown) {
        const errorMessage =
            (error as { data?: { message?: string } }).data?.message ||
            (error instanceof Error ? error.message : 'Не удалось удалить страницу');
        console.error('[PublishedPagesModal] Failed to delete page:', error);
        emit('error', errorMessage);
    } finally {
        isDeleting.value = false;
    }
}

/**
 * Обрабатывает закрытие модального окна.
 */
function handleClose(): void {
    emit('close');
}

// #endregion

// #region Lifecycle
watch(
    () => props.isOpen,
    (newIsOpen) => {
        if (newIsOpen) {
            fetchPages();
        }
    },
    { immediate: true }
);
// #endregion
</script>

<template>
    <BricksModal :is-open="props.isOpen" title="Сохранённые страницы" @close="handleClose">
        <div :class="$style.TheBuilderPublishPagesModal">
            <!-- Header -->
            <div :class="$style.header">
                <h2 :class="$style.title">Сохранённые страницы</h2>
                <BricksCloseButton @click="handleClose" />
            </div>

            <!-- Content -->
            <div :class="[$style.content, 'scrollbox']">
                <div v-if="loading" :class="$style.loading">
                    <div :class="$style.spinner"></div>
                    <p>Загрузка...</p>
                </div>

                <div v-else-if="publishedPages.length === 0" :class="$style.empty">
                    <h3 :class="$style.emptyTitle">Записей не найдено</h3>
                    <p :class="$style.emptyText">Вы пока не сохранили ни одной страницы.</p>
                </div>

                <div v-else :class="$style.list">
                    <BuilderPublishPageCard
                        v-for="page in publishedPages"
                        :key="page.id"
                        :page="page"
                        :is-publishing="Boolean(publishingStateById[String(page.id)])"
                        @preview="handlePreview"
                        @edit="handleEdit"
                        @toggle-published="handleTogglePublished"
                        @delete="handleDelete"
                    />
                </div>
            </div>
        </div>
    </BricksModal>

    <BricksConfirmModal
        :is-open="isDeleteConfirmationOpen"
        title="Удалить страницу?"
        :description="deleteConfirmationDescription"
        confirm-text="Удалить"
        confirm-variant="danger"
        :is-loading="isDeleting"
        @close="handleCloseDeleteConfirmation"
        @confirm="handleConfirmDelete"
    />
</template>

<style module lang="scss">
.TheBuilderPublishPagesModal {
    overflow: hidden;
    display: flex;
    width: 80rem;
    max-width: 90vw;
    max-height: 80vh;
    border-radius: 1.2rem;
    background-color: var(--bricks-base-0);
    box-shadow: var(--shadow-md);
    flex-direction: column;
}

.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2rem 2.4rem;
    border-bottom: 1px solid var(--bricks-base-300);
}

.title {
    margin: 0;
    font-size: 2rem;
    font-weight: 600;
    color: var(--bricks-base-900);
}

.content {
    overflow-y: auto;
    flex: 1;
    padding: 2.4rem;
}

.loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 2rem;
    color: var(--bricks-base-600);
}

.spinner {
    width: 4rem;
    height: 4rem;
    margin-bottom: 1.6rem;
    border-radius: 50%;
    border: 0.8rem solid var(--bricks-base-300);
    border-top: 0.8rem solid var(--bricks-base-300);
    animation: spin 1s linear infinite;
}

@keyframes spin {
    0% {
        transform: rotate(0deg);
    }

    100% {
        transform: rotate(360deg);
    }
}

.empty {
    padding: 4rem 2rem;
    text-align: center;
    color: var(--bricks-base-600);
}

.emptyIcon {
    margin-bottom: 2rem;
    font-size: 6rem;
}

.emptyTitle {
    margin: 0 0 1rem 0;
    font-size: 2rem;
    font-weight: 600;
    color: var(--bricks-base-600);
}

.emptyText {
    margin: 0;
    font-size: 1.4rem;
}

.list {
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
}
</style>
