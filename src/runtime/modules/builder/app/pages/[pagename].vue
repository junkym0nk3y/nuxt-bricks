<script setup lang="ts">
// #region Imports
// Types
import type { TMediaGalleryContext } from '../../../common/types/media';

// Vue
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Nuxt
import { definePageMeta, useHead, useRoute, useRouter, useCookie } from '#imports';

// Pinia
import { useComponentsStore } from '../../core/stores/components';
import { useCanvasStore } from '../../core/stores/canvas';
import { useSidebarStore } from '../../core/stores/sidebar';
import { useHistoryStore } from '../../core/stores/history';
import { usePublishStore } from '../../publish/stores/publish';
import { useInlineEditingStore } from '../../../text-editor/stores/inlineEditing';

// Composables
import { useBuilderPage } from '../composables/useBuilderPage';
import { useBuilderSession } from '../composables/useBuilderSession';
import { useBuilderDraftPersistence } from '../composables/useBuilderDraftPersistence';
import { useBuilderPagenameSync } from '../composables/useBuilderPagenameSync';

// Utils
import { loadFavoritesFromStorage } from '../../core/stores/actions/favorites';

// Components
import TheBuilderShellToolbar from '../../shell/toolbar/components/TheBuilderShellToolbar.vue';
import BuilderShellToolbarVerticalNav from '../../shell/toolbar/components/BuilderShellToolbarVerticalNav.vue';
import TheBuilderShellSidebar from '../../shell/sidebar/components/TheBuilderShellSidebar.vue';
import TheBuilderCanvas from '../../canvas/viewport/components/TheBuilderCanvas.vue';
import TheBuilderLoader from '../components/TheBuilderLoader.vue';
import TheBuilderDocumentationModal from '../../documentation/components/TheBuilderDocumentationModal.vue';
import TheBuilderMediaGalleryModal from '../../media/components/TheBuilderMediaGalleryModal.vue';
import BricksConfirmModal from '../../../ui/feedback/BricksConfirmModal.vue';
import TheBuilderMediaImageResolverModal from '../../media/components/TheBuilderMediaImageResolverModal.vue';
import BricksToast from '../../../ui/feedback/BricksToast.vue';
// #endregion

// #region Meta
definePageMeta({
    layout: 'bricks',
});
// #endregion

// #region Data
const { t, locale, setLocale } = useI18n();
const route = useRoute();
const router = useRouter();

const componentsStore = useComponentsStore();
const canvasStore = useCanvasStore();
const sidebarStore = useSidebarStore();
const historyStore = useHistoryStore();
const publishStore = usePublishStore();

// Мост media-запросов inline-редактора: editor подключается только здесь (composition root)
const inlineEditingStore = useInlineEditingStore();
const builder = await useBuilderPage({
    isRequestingMedia: computed(() => inlineEditingStore.isRequestingMedia),
    resolveMediaRequest: (item) => inlineEditingStore.resolveMediaRequest(item),
    cancelMediaRequest: () => inlineEditingStore.cancelMediaRequest(),
});

const {
    componentLibraryList,
    isDocumentationModalOpen,
    isMediaGalleryModalOpen,
    mediaGalleryContext,
    sidebarRef,
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
    handleOpenDocs,
    handleCloseDocs,
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

const darkModeCookie = useCookie<boolean>('bricks-dark-mode', {
    default: () => false,
    maxAge: 60 * 60 * 24 * 365,
});
const isDarkMode = ref(darkModeCookie.value ?? false);

const routePagename = computed<string>(() => String(route.params.pagename || '').trim());

// Сессия билдера: открытие страницы, черновики, модалка восстановления
const {
    isSessionLoading,
    isRestoreDraftModalOpen,
    savedSnapshot,
    buildCurrentSnapshot,
    openBuilderSession,
    handleRestoreDraft,
    handleDiscardDraft,
} = useBuilderSession({ routePagename, showToast });

// Автосохранение черновика (debounce) + синхронизация URL с pagename формы
useBuilderDraftPersistence({
    routePagename,
    isSessionLoading,
    isRestoreDraftModalOpen,
    savedSnapshot,
    buildCurrentSnapshot,
});
useBuilderPagenameSync(routePagename);
// #endregion

// #region Computed
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
 * Открывает менеджер страниц — полноэкранный дашборд `/bricks`.
 * Несохранённые изменения переживают переход через черновик (draft persistence).
 */
async function handleOpenPagesManager(): Promise<void> {
    await router.push('/bricks');
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

/**
 * Переключает локаль интерфейса (ru ⇄ en); cookie `bricks-locale` пишет сам i18n.
 */
async function handleToggleLocale(): Promise<void> {
    await setLocale(locale.value === 'ru' ? 'en' : 'ru');
}
// #endregion

// #region Lifecycle
/**
 * Класс body формируется реактивно — включает bricks-dark при активной тёмной теме.
 * Работает на SSR: cookie читается на сервере, класс рендерится сразу.
 */
const bodyClass = computed(() => (isDarkMode.value ? 'bricks-page bricks-dark' : 'bricks-page'));

useHead({
    bodyAttrs: {
        class: bodyClass,
    },
});

onMounted(() => {
    window.addEventListener('keydown', handleKeyDown);
    componentsStore.favorites = loadFavoritesFromStorage();

    if (routePagename.value) {
        openBuilderSession(routePagename.value).catch((error: unknown) => {
            console.error('[Builder] Failed to open builder session:', error);
        });
    }
});

onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleKeyDown);
});
// #endregion
</script>

<template>
    <div :class="[$style.BricksBuilder, 'bricks-text']">
        <TheBuilderShellToolbar
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
            @open-pages-manager="handleOpenPagesManager"
            @open-media-gallery="handleOpenMediaGalleryWithContext"
            @save-draft="handleSaveDraft"
            @save-as-copy="handleSaveAsCopy"
            @preview="handlePreview"
            @undo="handleUndo"
            @redo="handleRedo"
        />

        <div :class="$style.content">
            <BuilderShellToolbarVerticalNav
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
                @toggle-locale="handleToggleLocale"
            />

            <TheBuilderShellSidebar
                ref="sidebarRef"
                :components="componentLibraryList"
                @open-media-gallery="handleOpenMediaGalleryWithContext"
                @import-schema="handleImportSchema"
            />

            <div :class="$style.canvasWrapper">
                <TheBuilderLoader :is-loading="isSessionLoading" />
                <TheBuilderCanvas />
            </div>
        </div>

        <TheBuilderDocumentationModal
            :is-open="isDocumentationModalOpen"
            @close="handleCloseDocs"
        />

        <TheBuilderMediaGalleryModal
            :visible="isMediaGalleryModalOpen"
            :context="mediaGalleryContext"
            @close="handleCloseMediaGallery"
            @error="handleMediaError"
            @select="handleMediaSelect"
        />

        <BricksConfirmModal
            :is-open="isRestoreDraftModalOpen"
            :title="t('bricks.publish.draft.restoreTitle')"
            :description="t('bricks.publish.draft.restoreDescription')"
            :confirm-text="t('bricks.publish.draft.restoreConfirm')"
            :cancel-text="t('bricks.publish.draft.restoreCancel')"
            confirm-variant="primary"
            @close="handleDiscardDraft"
            @confirm="handleRestoreDraft"
        />

        <TheBuilderMediaImageResolverModal
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
.BricksBuilder {
    overflow: hidden;
    display: flex;
    width: 100vw;
    height: 100vh;
    background-color: var(--bricks-workspace-bg);
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
