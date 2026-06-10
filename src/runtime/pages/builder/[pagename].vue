<script setup lang="ts">
// #region Imports
// Types
import type { LandingSchema } from '../../types/landing';
import type { TMediaGalleryContext } from '../../types/media';
import type { TPublishFormState } from '../../types/landing-api';
import type { IBuilderDraftEntry, IBuilderDraftSnapshot } from '../../types/builder-drafts';

// Vue
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

// Nuxt
import { definePageMeta, useHead, useRoute, useRouter, useCookie } from '#imports';

// Pinia
import { useLandingComponentsStore } from '../../store/landing/components';
import { useLandingCanvasStore } from '../../store/landing/canvas';
import { useLandingSidebarStore } from '../../store/landing/sidebar';
import { useLandingHistoryStore } from '../../store/landing/history';
import { usePublishStore } from '../../store/publish';

// Composables
import { useLandingBuilderPage } from '../../composables/useLandingBuilderPage';

// Utils
import { serializeSchema } from '../../utils/landing';
import { loadFavoritesFromStorage } from '../../store/landing/actions/favorites';

// Components
import LandingBuilderToolbar from '../../components/toolbar/LandingBuilderToolbar.vue';
import BuilderVerticalNav from '../../components/toolbar/BuilderVerticalNav.vue';
import BuilderSidebar from '../../components/sidebar/BuilderSidebar.vue';
import LandingCanvas from '../../components/canvas/LandingCanvas.vue';
import BuilderLoader from '../../components/builder/BuilderLoader.vue';
import ThePublishedPagesModal from '../../components/modal/ThePublishedPagesModal.vue';
import TheDocumentationModal from '../../components/modal/TheDocumentationModal.vue';
import TheMediaGalleryModal from '../../components/modal/TheMediaGalleryModal.vue';
import ConfirmActionModal from '../../components/modal/ConfirmActionModal.vue';
import TheImageResolverModal from '../../components/modal/TheImageResolverModal.vue';
import BricksToast from '../../components/ui/feedback/BricksToast.vue';
// #endregion

// #region Meta
definePageMeta({
    layout: 'landing',
});
// #endregion

// #region Data
const route = useRoute();
const router = useRouter();

const componentsStore = useLandingComponentsStore();
const canvasStore = useLandingCanvasStore();
const sidebarStore = useLandingSidebarStore();
const historyStore = useLandingHistoryStore();
const publishStore = usePublishStore();

const builder = await useLandingBuilderPage();

const {
    componentLibraryList,
    isPublishedPagesModalOpen,
    isDocumentationModalOpen,
    isMediaGalleryModalOpen,
    mediaGalleryContext,
    builderSidebarRef,
    toast,
    isEditingExistingPage,
    hasSelectedComponent,
    leftSidebarOffset,
    currentPublishPageTitle,
    handleKeyDown,
    handleToggleLibrary,
    handleToggleProperties,
    handleToggleSchema,
    handleOpenPublishSettings,
    handleOpenPublishedPages,
    handleClosePublishedPagesModal,
    handleOpenDocs,
    handleCloseDocs,
    handlePublishedPagesError,
    handleMediaError,
    handleOpenMediaGallery,
    handleCloseMediaGallery,
    handleMediaSelect,
    handleSaveDraft,
    handleSaveAsCopy,
    handlePreview,
    handleUndo,
    handleRedo,
    showToast,
    isImageResolverModalOpen,
    imageResolverState,
    handleImportSchema,
    handleImageResolverConfirm,
    handleImageResolverCancel,
    handleImageResolverSkip,
    handleSetImageAction,
    handleSetGlobalAction,
} = builder;

const EMPTY_SCHEMA: LandingSchema = {
    components: [],
};

const darkModeCookie = useCookie<boolean>('land-dark-mode', {
    default: () => false,
    maxAge: 60 * 60 * 24 * 365,
});
const isDarkMode = ref(darkModeCookie.value ?? false);

const isSessionLoading = ref(true);
const isRestoreDraftModalOpen = ref(false);
const pendingDraft = ref<IBuilderDraftEntry | null>(null);
const savedSnapshot = ref<IBuilderDraftSnapshot | null>(null);
let persistTimer: number | null = null;
let pagenameRouteTimer: number | null = null;
// #endregion

// #region Computed
const routePagename = computed<string>(() => String(route.params.pagename || '').trim());
const toastDuration = computed<number>(() => toast.duration ?? 4000);
const isPublishSettingsComplete = computed<boolean>(() => {
    const { pagename, title, description } = publishStore.currentFormState;
    return Boolean((pagename ?? '').trim() && (title ?? '').trim() && (description ?? '').trim());
});

const isLibraryActive = computed<boolean>(
    () => sidebarStore.left.visible && sidebarStore.activeView === 'components'
);
const isPropertiesActive = computed<boolean>(
    () => sidebarStore.left.visible && sidebarStore.activeView === 'properties'
);
const isPublishSettingsActive = computed<boolean>(
    () => sidebarStore.left.visible && sidebarStore.activeView === 'publish'
);
const isSchemaActive = computed<boolean>(
    () => sidebarStore.left.visible && sidebarStore.activeView === 'schema'
);
// #endregion

// #region Methods
/**
 * Проверяет валидность slug (pagename).
 *
 * @param value - ЧПУ страницы.
 */
function isValidPagename(value: string): boolean {
    return Boolean(value) && /^[a-z0-9-]+$/.test(value);
}

/**
 * Формирует объект для сравнения из настроек публикации.
 *
 * @param formState - Состояние формы.
 */
function pickComparableFormState(formState: TPublishFormState): Record<string, unknown> {
    return {
        pagename: (formState.pagename ?? '').trim(),
        title: (formState.title ?? '').trim(),
        description: (formState.description ?? '').trim(),
        keywords: (formState.keywords ?? '').trim(),
        published: Boolean(formState.published),
        layout: formState.layout ?? '',
        backgroundColor: formState.backgroundColor ?? '',
        socialImage: formState.socialImage ?? '',
        urlPrefix: formState.urlPrefix ?? '',
        subdomain: formState.subdomain ?? '',
    };
}

/**
 * Сравнивает два снапшота (schema + publish settings).
 *
 * @param a - Первый снапшот.
 * @param b - Второй снапшот.
 */
function isSnapshotEqual(a: IBuilderDraftSnapshot, b: IBuilderDraftSnapshot): boolean {
    const schemaEqual = JSON.stringify(a.schema) === JSON.stringify(b.schema);
    if (!schemaEqual) {
        return false;
    }

    return (
        JSON.stringify(pickComparableFormState(a.formState)) ===
        JSON.stringify(pickComparableFormState(b.formState))
    );
}

/**
 * Строит актуальный снапшот из стора канваса и publish настроек.
 */
function buildCurrentSnapshot(): IBuilderDraftSnapshot {
    return {
        schema: serializeSchema(componentsStore.components),
        formState: publishStore.currentFormState,
    };
}

/**
 * Применяет снапшот в сторы билдера.
 *
 * @param snapshot - Снапшот для применения.
 */
function applySnapshot(snapshot: IBuilderDraftSnapshot): void {
    componentsStore.loadSchema(snapshot.schema, { resetHistory: true });
    publishStore.setCurrentFormState(snapshot.formState);
}

/**
 * Очищает таймер отложенного сохранения.
 */
function clearPersistTimer(): void {
    if (persistTimer === null) {
        return;
    }

    window.clearTimeout(persistTimer);
    persistTimer = null;
}

/**
 * Сохраняет черновик в localStorage, если есть несохранённые изменения.
 */
function persistDraftNow(): void {
    if (typeof window === 'undefined') {
        return;
    }

    const pagename = routePagename.value;
    if (!pagename) {
        return;
    }

    const snapshot = buildCurrentSnapshot();
    const isEditing = publishStore.editingPageId !== null;

    if (isEditing && savedSnapshot.value && isSnapshotEqual(snapshot, savedSnapshot.value)) {
        publishStore.removeBuilderDraft(pagename);
        return;
    }

    publishStore.setBuilderDraft({
        pagename,
        updatedAt: new Date().toISOString(),
        mode: isEditing ? 'edit' : 'new',
        pageId:
            typeof publishStore.editingPageId === 'number' ? publishStore.editingPageId : undefined,
        savedSnapshot: savedSnapshot.value ?? undefined,
        draftSnapshot: snapshot,
    });
}

/**
 * Планирует сохранение черновика (debounce).
 */
function scheduleDraftPersist(): void {
    if (typeof window === 'undefined' || isSessionLoading.value) {
        return;
    }

    clearPersistTimer();
    persistTimer = window.setTimeout(() => {
        persistDraftNow();
        clearPersistTimer();
    }, 800);
}

/**
 * Загружает страницу в билдер по pagename, учитывая черновики.
 *
 * @param pagename - ЧПУ страницы из URL.
 */
async function openBuilderSession(pagename: string): Promise<void> {
    if (!pagename) {
        return;
    }

    isSessionLoading.value = true;
    isRestoreDraftModalOpen.value = false;
    pendingDraft.value = null;
    savedSnapshot.value = null;

    try {
        if (!publishStore.publishedPages.length) {
            await publishStore.loadAllPages();
        }

        const existingPage = publishStore.getPageByPagename(pagename);
        const draft = publishStore.getBuilderDraft(pagename);

        if (existingPage) {
            publishStore.startEditingPage(existingPage.id);
            componentsStore.loadSchema(existingPage.schema, { resetHistory: true });

            savedSnapshot.value = buildCurrentSnapshot();

            if (
                draft &&
                draft.mode === 'edit' &&
                draft.draftSnapshot &&
                !isSnapshotEqual(draft.draftSnapshot, savedSnapshot.value)
            ) {
                pendingDraft.value = draft;
                isRestoreDraftModalOpen.value = true;
                return;
            }

            if (draft && draft.mode === 'edit' && draft.draftSnapshot) {
                publishStore.removeBuilderDraft(pagename);
            }

            return;
        }

        publishStore.startNewPublish();
        publishStore.setCurrentFormField('pagename', pagename);
        componentsStore.loadSchema(EMPTY_SCHEMA, { resetHistory: true });

        if (draft?.draftSnapshot) {
            applySnapshot(draft.draftSnapshot);
            showToast('Есть несохранённые изменения', 'error', 30000);
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Не удалось загрузить страницу';
        showToast(message, 'error');
    } finally {
        isSessionLoading.value = false;
    }
}

/**
 * Восстанавливает изменения из черновика (для существующей страницы).
 */
function handleRestoreDraft(): void {
    const draft = pendingDraft.value;
    if (!draft?.draftSnapshot) {
        isRestoreDraftModalOpen.value = false;
        pendingDraft.value = null;
        return;
    }

    applySnapshot(draft.draftSnapshot);
    isRestoreDraftModalOpen.value = false;
    pendingDraft.value = null;
}

/**
 * Отказывается от восстановления и удаляет черновик, открывая сохранённую версию.
 */
function handleDiscardDraft(): void {
    const pagename = routePagename.value;
    if (pagename) {
        publishStore.removeBuilderDraft(pagename);
    }

    isRestoreDraftModalOpen.value = false;
    pendingDraft.value = null;
}

/**
 * Обрабатывает выбор страницы в модалке "Сохранённые страницы" и синхронизирует URL.
 *
 * @param pageId - Идентификатор страницы.
 */
async function handleEditFromModal(pageId: string): Promise<void> {
    handleClosePublishedPagesModal();

    const page = publishStore.getPageById(pageId);
    if (!page) {
        showToast('Страница не найдена', 'error');
        return;
    }

    await router.push(`/builder/${page.pagename}`);
    sidebarStore.showSidebarView('publish');
}

/**
 * Делегирует открытие галереи медиа с контекстом.
 *
 * @param context - Контекст вызова.
 */
function handleOpenMediaGalleryWithContext(context?: TMediaGalleryContext): void {
    handleOpenMediaGallery(context);
}

/**
 * Переключает тёмную/светлую тему билдера и сохраняет выбор в cookie.
 */
function handleToggleDarkMode(): void {
    isDarkMode.value = !isDarkMode.value;
    darkModeCookie.value = isDarkMode.value;
}
// #endregion

// #region Watchers
watch(
    () => routePagename.value,
    (next) => {
        if (!next) {
            return;
        }

        openBuilderSession(next).catch((error: unknown) => {
            console.error('[Builder] Failed to open builder session:', error);
        });
    },
    { immediate: true }
);

watch(
    () => publishStore.currentFormState.pagename,
    (next) => {
        if (typeof window === 'undefined') {
            return;
        }

        // Не синхронизируем URL при редактировании существующей страницы
        if (publishStore.editingPageId !== null) {
            return;
        }

        const normalized = String(next ?? '').trim();
        if (!normalized || !isValidPagename(normalized)) {
            return;
        }

        // Debounce URL sync — просто меняем адресную строку без навигации
        if (pagenameRouteTimer !== null) {
            window.clearTimeout(pagenameRouteTimer);
        }

        pagenameRouteTimer = window.setTimeout(() => {
            pagenameRouteTimer = null;

            const currentNormalized = String(publishStore.currentFormState.pagename ?? '').trim();
            if (
                !currentNormalized ||
                !isValidPagename(currentNormalized) ||
                !publishStore.isPagenameAvailable(currentNormalized)
            ) {
                return;
            }

            // Мигрируем черновик на новый pagename
            const from = routePagename.value;
            if (from && from !== currentNormalized) {
                publishStore.migrateBuilderDraft(from, currentNormalized);
            }

            // Меняем URL без навигации (не триггерит Vue Router)
            const newUrl = `/builder/${currentNormalized}`;
            window.history.replaceState(window.history.state, '', newUrl);
        }, 600);
    }
);

watch(
    [() => historyStore.historyIndex, () => publishStore.currentFormState],
    () => {
        scheduleDraftPersist();
    },
    { deep: false }
);

watch(
    () => publishStore.lastSuccessfulSaveAt,
    () => {
        if (publishStore.editingPageId === null) {
            savedSnapshot.value = null;
            return;
        }

        savedSnapshot.value = buildCurrentSnapshot();
        publishStore.removeBuilderDraft(routePagename.value);
    }
);
// #endregion

// #region Lifecycle
/**
 * Класс body формируется реактивно — включает land-dark при активной тёмной теме.
 * Работает на SSR: cookie читается на сервере, класс рендерится сразу.
 */
const bodyClass = computed(() =>
    isDarkMode.value ? 'bricks-page land-dark' : 'bricks-page'
);

useHead({
    bodyAttrs: {
        class: bodyClass,
    },
});

onMounted(() => {
    window.addEventListener('keydown', handleKeyDown);
    componentsStore.favorites = loadFavoritesFromStorage();
});

onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleKeyDown);
    clearPersistTimer();
    if (pagenameRouteTimer !== null) {
        window.clearTimeout(pagenameRouteTimer);
        pagenameRouteTimer = null;
    }
});
// #endregion
</script>

<template>
    <div :class="[$style.LandingBuilder, 'bricks-text']">
        <LandingBuilderToolbar
            :history-index="historyStore.historyIndex"
            :history-length="historyStore.history.length"
            :is-editing-existing-page="isEditingExistingPage"
            :is-submitting-publish="publishStore.isSubmitting"
            :has-selected-component="hasSelectedComponent"
            :is-publish-settings-complete="isPublishSettingsComplete"
            :show-grid="canvasStore.showGrid"
            :sidebar-offset="leftSidebarOffset"
            :page-title="currentPublishPageTitle"
            @toggle-grid="canvasStore.toggleGrid"
            @open-published-pages="handleOpenPublishedPages"
            @open-media-gallery="handleOpenMediaGalleryWithContext"
            @save-draft="handleSaveDraft"
            @save-as-copy="handleSaveAsCopy"
            @preview="handlePreview"
            @undo="handleUndo"
            @redo="handleRedo"
        />

        <div :class="$style.content">
            <BuilderVerticalNav
                :is-library-active="isLibraryActive"
                :is-properties-active="isPropertiesActive"
                :is-schema-active="isSchemaActive"
                :is-publish-settings-active="isPublishSettingsActive"
                :has-selected-component="hasSelectedComponent"
                :is-publish-settings-complete="isPublishSettingsComplete"
                :is-dark-mode="isDarkMode"
                @toggle-library="handleToggleLibrary"
                @toggle-properties="handleToggleProperties"
                @toggle-schema="handleToggleSchema"
                @open-publish-settings="handleOpenPublishSettings"
                @open-docs="handleOpenDocs"
                @toggle-dark-mode="handleToggleDarkMode"
            />

            <BuilderSidebar
                ref="builderSidebarRef"
                :components="componentLibraryList"
                @open-media-gallery="handleOpenMediaGalleryWithContext"
                @import-schema="handleImportSchema"
            />

            <div :class="$style.canvasWrapper">
                <BuilderLoader :is-loading="isSessionLoading" />
                <LandingCanvas />
            </div>
        </div>

        <ThePublishedPagesModal
            :is-open="isPublishedPagesModalOpen"
            @close="handleClosePublishedPagesModal"
            @edit="handleEditFromModal"
            @error="handlePublishedPagesError"
        />

        <TheDocumentationModal :is-open="isDocumentationModalOpen" @close="handleCloseDocs" />

        <TheMediaGalleryModal
            :visible="isMediaGalleryModalOpen"
            :context="mediaGalleryContext"
            @close="handleCloseMediaGallery"
            @error="handleMediaError"
            @select="handleMediaSelect"
        />

        <ConfirmActionModal
            :is-open="isRestoreDraftModalOpen"
            title="Восстановить несохранённые изменения?"
            description="Мы нашли изменения, которые не были сохранены. Восстановить их?"
            confirm-text="Восстановить изменения"
            cancel-text="Открыть сохранённую"
            confirm-variant="primary"
            @close="handleDiscardDraft"
            @confirm="handleRestoreDraft"
        />

        <TheImageResolverModal
            :is-open="isImageResolverModalOpen"
            :state="imageResolverState"
            @confirm="handleImageResolverConfirm"
            @cancel="handleImageResolverCancel"
            @skip="handleImageResolverSkip"
            @set-image-action="handleSetImageAction"
            @set-global-action="handleSetGlobalAction"
        />

        <BricksToast
            v-model:visible="toast.visible"
            :message="toast.message"
            :variant="toast.variant"
            :duration="toastDuration"
        />
    </div>
</template>

<style module lang="scss">
.LandingBuilder {
    overflow: hidden;
    display: flex;
    width: 100vw;
    height: 100vh;
    background-color: var(--land-base-100);
    flex-direction: column;
}

.content {
    position: relative;
    overflow: hidden;
    display: flex;
    flex: 1;
}

.canvasWrapper {
    position: relative;
    overflow: hidden;
    display: flex;
    flex: 1;
}
</style>
