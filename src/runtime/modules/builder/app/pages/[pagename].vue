<script setup lang="ts">
// #region Imports
// Types
import type { TMediaGalleryContext } from '../../../common/types/media';

// Vue
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Nuxt
import { definePageMeta, useHead, useRouter, useCookie } from '#imports';

// Pinia
import { useComponentsStore } from '../../core/stores/components';
import { useSidebarStore } from '../../core/stores/sidebar';
import { usePublishStore } from '../../publish/stores/publish';
import { useInlineEditingStore } from '../../../text-editor/stores/inlineEditing';

// Composables
import { useBuilderPage } from '../composables/useBuilderPage';
import { useBuilderPagename } from '../composables/useBuilderPagename';
import { useBuilderSession } from '../composables/useBuilderSession';
import { useBuilderSessionToken } from '../composables/useBuilderSessionToken';
import { useBuilderDraftPersistence } from '../composables/useBuilderDraftPersistence';
import { useBuilderPagenameSync } from '../composables/useBuilderPagenameSync';
import { useBuilderToast } from '../../core/composables/useBuilderToast';

// Utils
import { loadFavoritesFromStorage } from '../../core/stores/actions/favorites';
import { runSaveWhenSessionReady, withSessionReadyGuard } from '../utils/sessionGuards';
import { BRICKS_ROUTE_NAMES } from '../../../common/constants/routes';

// Components
import TheBuilderShellToolbar from '../../shell/toolbar/components/TheBuilderShellToolbar.vue';
import BuilderShellToolbarVerticalNav from '../../shell/toolbar/components/BuilderShellToolbarVerticalNav.vue';
import TheBuilderShellSidebar from '../../shell/sidebar/components/TheBuilderShellSidebar.vue';
import TheBuilderShellSidebarPropertiesPanel from '../../shell/sidebar/components/TheBuilderShellSidebarPropertiesPanel.vue';
import TheBuilderCanvas from '../../canvas/viewport/components/TheBuilderCanvas.vue';
import TheBuilderLoader from '../components/TheBuilderLoader.vue';
import TheBuilderSessionError from '../components/TheBuilderSessionError.vue';
import BricksConfirmModal from '../../../ui/feedback/BricksConfirmModal.vue';
import TheBuilderMediaImageResolverModal from '../../media/components/TheBuilderMediaImageResolverModal.vue';
import BricksToast from '../../../ui/feedback/BricksToast.vue';

// Модалки — lazy-чанки: не нужны до открытия
const TheBuilderDocumentationModal = defineAsyncComponent(
    () => import('../../documentation/components/TheBuilderDocumentationModal.vue')
);
const TheBuilderMediaGalleryModal = defineAsyncComponent(
    () => import('../../media/components/TheBuilderMediaGalleryModal.vue')
);
// #endregion

// #region Meta
definePageMeta({
    layout: 'bricks',
    // Статический page key: дефолтный key Nuxt — интерполированный path, из-за чего
    // смена :pagename перемонтировала бы страницу. Rename сессии (router.replace из
    // useBuilderPagename.renameSession) остаётся на живом канвасе; навигация на другую
    // страницу обрабатывается watcher'ом useBuilderSession.
    key: 'bricks-builder-pagename',
});
// #endregion

// #region Data
const { t, locale, setLocale } = useI18n();
const router = useRouter();

const componentsStore = useComponentsStore();
const sidebarStore = useSidebarStore();
const publishStore = usePublishStore();

// Владелец pagename: route.params — источник истины URL, sessionPagename — ключ черновиков
const { routePagename, sessionPagename, renameSession } = useBuilderPagename();

// Toast — модульный синглтон (useBuilderToast): нужен useBuilderSession раньше
// useBuilderPage (switchToSavedPage требуется useBuilderPage для Save as Copy)
const { showToast } = useBuilderToast();

// Токен сессии — общая точка отсечения операций, которые начинаются в одной
// сессии и завершаются в другой (сохранение, снимок превью, синк превью-вкладки,
// портальные модалки). Инкрементами владеет useBuilderSession, остальные читают
const sessionToken = useBuilderSessionToken();

// Сессия билдера: открытие страницы, черновики, модалка восстановления,
// единый переход на сохранённую копию (switchToSavedPage)
const {
    isSessionLoading,
    isSessionReady,
    sessionError,
    isRestoreDraftModalOpen,
    savedSnapshot,
    buildCurrentSnapshot,
    commitSavedSnapshot,
    switchToSavedPage,
    openBuilderSession,
    retryBuilderSession,
    handleRestoreDraft,
    handleDiscardDraft,
} = useBuilderSession({ routePagename, sessionPagename, showToast, renameSession, sessionToken });

// Мост inline-редактора: editor подключается только здесь (composition root)
const inlineEditingStore = useInlineEditingStore();
const builder = await useBuilderPage({
    inlineMediaBridge: {
        isRequestingMedia: computed(() => inlineEditingStore.isRequestingMedia),
        resolveMediaRequest: (item) => inlineEditingStore.resolveMediaRequest(item),
        cancelMediaRequest: () => inlineEditingStore.cancelMediaRequest(),
        cancelInlineEditing: () => inlineEditingStore.stopEditing(),
    },
    renameSession,
    switchToSavedPage,
    commitSavedSnapshot,
    sessionToken,
});

const {
    componentLibraryList,
    isDocumentationModalOpen,
    isMediaGalleryModalOpen,
    mediaGalleryContext,
    sidebarRef,
    propertiesPanelRef,
    toast,
    isEditingExistingPage,
    hasSelectedComponent,
    leftSidebarOffset,
    currentPublishPageTitle,
    handleKeyDown,
    handleToggleLibrary,
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

// Горячие клавиши — только в согласованную сессию: обработчик висит на window,
// поэтому ни щит, ни inert его не останавливают (правило — в sessionGuards)
const handleGuardedKeyDown = withSessionReadyGuard<KeyboardEvent>(
    () => isSessionReady.value,
    handleKeyDown
);

// Автосохранение черновика (debounce) + синхронизация URL с pagename формы
useBuilderDraftPersistence({
    routePagename,
    sessionPagename,
    isSessionLoading,
    isSessionReady,
    isRestoreDraftModalOpen,
    savedSnapshot,
    buildCurrentSnapshot,
});
useBuilderPagenameSync({ renameSession, isSessionReady });
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
    await router.push({ name: BRICKS_ROUTE_NAMES.builderIndex });
}

/**
 * Повторяет открытие сессии с блокирующего экрана ошибки.
 */
async function handleRetrySession(): Promise<void> {
    await retryBuilderSession();
}

/**
 * Сохраняет страницу, если сессия согласована (правило — в `runSaveWhenSessionReady`).
 */
async function handleSaveDraftGuarded(): Promise<void> {
    await runSaveWhenSessionReady({
        isSessionReady: () => isSessionReady.value,
        save: handleSaveDraft,
        onBlocked: () => showToast(t('bricks.publish.session.saveBlocked'), 'error'),
    });
}

/**
 * Сохраняет страницу копией, если сессия согласована.
 */
async function handleSaveAsCopyGuarded(): Promise<void> {
    await runSaveWhenSessionReady({
        isSessionReady: () => isSessionReady.value,
        save: handleSaveAsCopy,
        onBlocked: () => showToast(t('bricks.publish.session.saveBlocked'), 'error'),
    });
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
    window.addEventListener('keydown', handleGuardedKeyDown);
    componentsStore.favorites = loadFavoritesFromStorage();

    if (routePagename.value) {
        openBuilderSession(routePagename.value).catch((error: unknown) => {
            console.error('[Builder] Failed to open builder session:', error);
        });
    }
});

onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleGuardedKeyDown);
});
// #endregion
</script>

<template>
    <div :class="[$style.BricksBuilder, 'bricks-text']">
        <TheBuilderShellToolbar
            :is-editing-existing-page="isEditingExistingPage"
            :is-submitting-publish="publishStore.isSubmitting"
            :has-selected-component="hasSelectedComponent"
            :is-publish-settings-complete="isPublishSettingsComplete"
            :is-session-ready="isSessionReady"
            :sidebar-offset="leftSidebarOffset"
            :page-title="currentPublishPageTitle"
            @open-pages-manager="handleOpenPagesManager"
            @open-media-gallery="handleOpenMediaGalleryWithContext"
            @save-draft="handleSaveDraftGuarded"
            @save-as-copy="handleSaveAsCopyGuarded"
            @preview="handlePreview"
        />

        <div :class="$style.content">
            <!--
                inert на всё время незавершённой сессии: щит ниже держит только мышь,
                а Tab, уже сфокусированное поле и accessibility tree он не закрывает —
                правка через клавиатуру всё равно потерялась бы молча
            -->
            <div :class="$style.workspace" :inert="!isSessionReady">
                <BuilderShellToolbarVerticalNav
                    :is-library-active="isLibraryActive"
                    :is-schema-active="isSchemaActive"
                    :is-publish-settings-active="isPublishSettingsActive"
                    :is-publish-settings-complete="isPublishSettingsComplete"
                    :is-dark-mode="isDarkMode"
                    @toggle-library="handleToggleLibrary"
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

                <TheBuilderShellSidebarPropertiesPanel
                    ref="propertiesPanelRef"
                    @open-media-gallery="handleOpenMediaGalleryWithContext('properties')"
                />

                <div :class="$style.canvasWrapper">
                    <TheBuilderLoader :is-loading="isSessionLoading" />
                    <TheBuilderCanvas />
                </div>
            </div>

            <!--
                Сессия не открылась: экран перекрывает всю рабочую область, включая
                сайдбары, — правки канваса и настроек публикации отклоняются
                автосейвом по !isSessionReady, то есть терялись бы молча
            -->
            <TheBuilderSessionError
                v-if="sessionError"
                :message="sessionError"
                :is-retrying="isSessionLoading"
                @retry="handleRetrySession"
                @open-pages-manager="handleOpenPagesManager"
            />

            <!--
                То же окно, но пока сессия ещё открывается (в том числе на повторной
                попытке): правка до готовности либо затирается пришедшей схемой, либо
                уезжает в savedSnapshot как «уже сохранённая» — и теряется на reload
            -->
            <div v-else-if="!isSessionReady" :class="$style.sessionShield" aria-hidden="true"></div>
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

/* Обёртка рабочей области — носитель inert; раскладку .content повторяет один в один */
.workspace {
    display: flex;
    flex: 1;
    min-width: 0;
}

.canvasWrapper {
    position: relative;
    overflow: hidden;
    display: flex;
    flex: 1;
}

/*
 * Щит на время открытия сессии. До готовности правки терять нельзя, а именно это
 * и происходило: автосейв их отклоняет по !isSessionReady, канвас потом затирается
 * пришедшей схемой, а правка формы уезжает в savedSnapshot как «уже сохранённая»
 * — черновик не создаётся, и reload её теряет. Лоадер не защита: он закрывает
 * только канвас и прячется через один цикл анимации независимо от загрузки.
 * z-index — как у экрана ошибки: выше сайдбаров и навигации, ниже лоадера.
 */
.sessionShield {
    position: absolute;
    z-index: 90;
    background: color-mix(in srgb, var(--bricks-base-0) 55%, transparent);
    cursor: progress;
    inset: 0;
}
</style>
