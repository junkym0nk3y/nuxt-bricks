// #region Imports
// Types
import type { IBricksSchema } from '../../../common/types/brick';
import type { IMediaItem, TMediaGalleryContext } from '../../../common/types/media';
import type { ISidebarExpose } from '../types/builder';
import type { IInlineMediaBridge, IUseBuilderPageReturn } from '../types/composables';

// Utils
import { setPublishStoreBackgroundColor } from '../../publish/utils/formState';
import { removeBuilderDraft } from '../../publish/utils/draftStorage';

// Vue
import { computed, provide, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useComponentLibraryDrag } from './useDraggableComponent';
import { useModals } from './useModals';
import { useComponentLibrary } from './useComponentLibrary';
import { useBuilderShortcuts } from './useBuilderShortcuts';
import { useBuilderToast } from './useBuilderToast';
import { usePreviewSync } from './usePreviewSync';
import { useBricksConfig } from '../../../common/composables/useBricksConfig';
import { useSchemaImageResolver } from '../../media/composables/useSchemaImageResolver';

// Pinia
import { useComponentsStore } from '../../core/stores/components';
import { useSidebarStore } from '../../core/stores/sidebar';
import { useHistoryStore } from '../../core/stores/history';
import { usePublishStore } from '../../publish/stores/publish';
// #endregion

/**
 * Собирает всю бизнес-логику страницы билдера и отдаёт Vue-компоненту только необходимые состояния.
 *
 * @param inlineMediaBridge - Мост media-запросов inline-редактора; собирается
 * composition root'ом (`pages/[pagename].vue`), чтобы builder-ядро не зависело от editor.
 */
export async function useBuilderPage(
    inlineMediaBridge: IInlineMediaBridge
): Promise<IUseBuilderPageReturn> {
    // #region Stores & Composables
    const { t } = useI18n();
    const componentsStore = useComponentsStore();
    const sidebarStore = useSidebarStore();
    const historyStore = useHistoryStore();
    const publishStore = usePublishStore();
    const dragComposable = useComponentLibraryDrag();
    const { loadModals } = useModals();
    const bricksConfig = useBricksConfig();

    // Кэшируем backgroundColor для использования в store (вне Vue контекста)
    setPublishStoreBackgroundColor(bricksConfig.backgroundColor || '#FFFFFF');

    provide('dragComposable', dragComposable);
    provide('availableFonts', bricksConfig.fonts ?? [bricksConfig.defaultFont]);

    // Загружаем модалки при старте билдера (не блокируя setup)
    loadModals();

    const imageResolver = useSchemaImageResolver();
    const { startPreviewSync } = usePreviewSync();
    const { handleKeyDown } = useBuilderShortcuts();
    const { toast, showToast } = useBuilderToast();
    const { componentLibraryList } = await useComponentLibrary();
    // #endregion

    // #region State
    const isPublishedPagesModalOpen = ref(false);
    const isDocumentationModalOpen = ref(false);
    const isMediaGalleryModalOpen = ref(false);
    const mediaGalleryContext = ref<TMediaGalleryContext>('manager');
    const sidebarRef = ref<ISidebarExpose | null>(null);
    // #endregion

    // #region Computed
    const isEditingExistingPage = computed(() => publishStore.editingPageId !== null);
    const hasSelectedComponent = computed(() => Boolean(componentsStore.selectedComponent));
    const leftSidebarOffset = computed(() =>
        sidebarStore.left.visible ? sidebarStore.left.width : '0px'
    );
    const currentPublishPageTitle = computed(() => {
        const { title, pagename } = publishStore.currentFormState;
        return (title ?? '').trim() || (pagename ?? '').trim() || '';
    });
    // #endregion

    // #region Sidebar toggles
    /**
     * Переключает видимость библиотеки компонентов в сайдбаре.
     */
    function handleToggleLibrary(): void {
        sidebarStore.toggleSidebarView('components');
    }

    /**
     * Переключает видимость панели свойств в сайдбаре.
     */
    function handleToggleProperties(): void {
        sidebarStore.toggleSidebarView('properties');
    }

    /**
     * Переключает видимость схемы компонентов в сайдбаре.
     */
    function handleToggleSchema(): void {
        sidebarStore.toggleSidebarView('schema');
    }
    // #endregion

    // #region Publish handlers
    /**
     * Открывает панель настроек публикации.
     * Если панель ещё не видна и нет черновых данных, инициализирует новую публикацию.
     */
    function handleOpenPublishSettings(): void {
        const isPublishViewVisible =
            sidebarStore.left.visible && sidebarStore.activeView === 'publish';
        if (!isPublishViewVisible) {
            const { pagename, title, description } = publishStore.currentFormState;
            const hasDraftData =
                (pagename ?? '').trim().length > 0 ||
                (title ?? '').trim().length > 0 ||
                (description ?? '').trim().length > 0;

            if (!hasDraftData && publishStore.editingPageId === null) {
                publishStore.startNewPublish();
            } else {
                publishStore.clearErrors();
            }
        }
        sidebarStore.toggleSidebarView('publish');
    }

    /**
     * Гарантирует видимость панели настроек публикации.
     * Всегда открывает панель публикации при ошибках валидации, чтобы подсветить поля.
     *
     * @param _message - Сообщение об ошибке (не используется напрямую).
     */
    function ensurePublishSettingsVisible(_message: string): void {
        handleOpenPublishSettings();
    }

    /**
     * Открывает модальное окно со списком опубликованных страниц.
     */
    function handleOpenPublishedPages(): void {
        isPublishedPagesModalOpen.value = true;
    }

    /**
     * Закрывает модальное окно со списком опубликованных страниц.
     */
    function handleClosePublishedPagesModal(): void {
        isPublishedPagesModalOpen.value = false;
    }

    /**
     * Открывает модальное окно документации.
     */
    function handleOpenDocs(): void {
        isDocumentationModalOpen.value = true;
    }

    /**
     * Закрывает модальное окно документации.
     */
    function handleCloseDocs(): void {
        isDocumentationModalOpen.value = false;
    }

    /**
     * Сохраняет лендинг с указанным статусом публикации.
     * При успехе показывает toast с сообщением, при ошибке откатывает статус.
     *
     * @param published - Флаг публикации (true = опубликовано, false = черновик).
     * @param successMessage - Сообщение для отображения при успехе.
     * @returns true при успешном сохранении, false при ошибке.
     */
    async function submitPageWithPublishState(
        published: boolean,
        successMessage: string
    ): Promise<boolean> {
        const previousPublished = publishStore.currentFormState.published;
        publishStore.setCurrentFormField('published', published);
        const schema = componentsStore.exportSchema();
        const result = await publishStore.publishCurrentPage(schema);

        if (result !== null) {
            showToast(successMessage, 'success');
            if (publishStore.editingPageId === null) {
                publishStore.startEditingPage(result);
            }

            const currentPagename = publishStore.currentFormState.pagename;
            if (currentPagename) {
                removeBuilderDraft(currentPagename);

                // Синхронизируем URL с актуальным pagename после сохранения
                const currentUrl = window.location.pathname;
                const expectedUrl = `/builder/${currentPagename}`;
                if (currentUrl !== expectedUrl) {
                    window.history.replaceState(window.history.state, '', expectedUrl);
                }
            }
            return true;
        }

        publishStore.setCurrentFormField('published', previousPublished);
        const errorMessage = publishStore.generalError || t('bricks.publish.toasts.savePageFailed');
        ensurePublishSettingsVisible(errorMessage);
        showToast(errorMessage, 'error');
        return false;
    }

    /**
     * Сохраняет лендинг как черновик или обновляет существующую страницу.
     * Сообщение зависит от того, редактируется ли существующая страница и её статуса публикации.
     */
    async function handleSaveDraft(): Promise<void> {
        const published = publishStore.currentFormState.published;
        const message = isEditingExistingPage.value
            ? published
                ? t('bricks.publish.toasts.pageUpdated')
                : t('bricks.publish.toasts.draftUpdated')
            : published
              ? t('bricks.publish.toasts.pagePublished')
              : t('bricks.publish.toasts.draftSaved');
        await submitPageWithPublishState(published, message);
    }

    /**
     * Сохраняет текущий лендинг как копию с новым ID.
     * После успешного сохранения обновляет список страниц и переключается на редактирование копии.
     */
    async function handleSaveAsCopy(): Promise<void> {
        const schema = componentsStore.exportSchema();
        const result = await publishStore.saveCurrentPageAsCopy(schema);
        if (result !== null) {
            try {
                await publishStore.loadAllPages();
            } catch (error: unknown) {
                const message =
                    error instanceof Error
                        ? error.message
                        : t('bricks.publish.toasts.refreshListFailed');
                showToast(message, 'error');
                return;
            }

            publishStore.startEditingPage(result);
            showToast(t('bricks.publish.toasts.copySaved'), 'success');
            return;
        }
        const errorMessage = publishStore.generalError || t('bricks.publish.toasts.copyFailed');
        ensurePublishSettingsVisible(errorMessage);
        showToast(errorMessage, 'error');
    }

    /**
     * Открывает превью текущего лендинга в новой вкладке.
     * После открытия запускает синхронизацию — изменения на канвасе будут отражаться в превью в реальном времени.
     */
    async function handlePreview(): Promise<void> {
        const schema = componentsStore.exportSchema();
        const success = publishStore.previewCurrentPage(schema);

        if (success && import.meta.client) {
            try {
                const stored = window.localStorage.getItem('bricks-preview-page');
                if (stored) {
                    const parsed = JSON.parse(stored) as Record<string, unknown>;
                    startPreviewSync(String(parsed.pagename ?? ''));
                }
            } catch {
                // ignore
            }
        } else if (!success) {
            showToast(
                publishStore.generalError || t('bricks.publish.toasts.previewFailed'),
                'error'
            );
        }
    }

    /**
     * Обрабатывает ошибки из модального окна опубликованных страниц.
     *
     * @param message - Текст ошибки для отображения.
     */
    function handlePublishedPagesError(message: string): void {
        showToast(message, 'error');
    }

    /**
     * Показывает ошибку медиа-галереи (например, недоступна БД).
     *
     * @param message - Текст ошибки.
     */
    function handleMediaError(message: string): void {
        showToast(message, 'error');
    }
    // #endregion

    // #region Media gallery
    /**
     * Открывает модальное окно медиа-галереи.
     */
    function handleOpenMediaGallery(context: TMediaGalleryContext = 'manager'): void {
        mediaGalleryContext.value = context;
        isMediaGalleryModalOpen.value = true;
    }

    /**
     * Закрывает модальное окно медиа-галереи.
     */
    function handleCloseMediaGallery(): void {
        isMediaGalleryModalOpen.value = false;
        mediaGalleryContext.value = 'manager';
        inlineMediaBridge.cancelMediaRequest();
    }

    /**
     * Обрабатывает выбор медиа-элемента из галереи.
     * Передаёт выбранный элемент в сайдбар (или в inline editor) и закрывает галерею.
     *
     * @param item - Выбранный медиа-элемент.
     */
    function handleMediaSelect(item: IMediaItem): void {
        if (inlineMediaBridge.isRequestingMedia.value) {
            inlineMediaBridge.resolveMediaRequest(item);
            isMediaGalleryModalOpen.value = false;
            mediaGalleryContext.value = 'manager';
            return;
        }

        sidebarRef.value?.handleMediaSelect(item);
        isMediaGalleryModalOpen.value = false;
        mediaGalleryContext.value = 'manager';
    }

    // Открываем MediaGallery когда inline editor запрашивает изображение
    watch(inlineMediaBridge.isRequestingMedia, (requesting) => {
        if (requesting) {
            handleOpenMediaGallery('properties');
        }
    });
    // #endregion

    // #region Published pages actions
    /**
     * Открывает страницу для редактирования.
     * Загружает схему страницы в store компонентов и переключает сайдбар на панель публикации.
     *
     * @param pageId - Идентификатор страницы для редактирования.
     */
    function handleEditPage(pageId: string): void {
        const page = publishStore.getPageById(pageId);
        if (page) {
            componentsStore.loadSchema(page.schema, { resetHistory: true });
        } else {
            console.error('[BricksBuilder] handleEditPage: page not found', pageId);
        }
        publishStore.startEditingPage(pageId);
        sidebarStore.showSidebarView('publish');
    }
    // #endregion

    // #region History
    /**
     * Отменяет последнее действие (Undo).
     */
    function handleUndo(): void {
        componentsStore.undo();
    }

    /**
     * Повторяет отменённое действие (Redo).
     */
    function handleRedo(): void {
        componentsStore.redo();
    }
    // #endregion

    // #region Schema import with image resolving
    /**
     * Импортирует JSON-схему с предварительным резолвингом изображений.
     * Если найдены новые изображения — показывает модалку с выбором действий.
     *
     * @param schema - Импортируемая схема.
     */
    async function handleImportSchema(schema: IBricksSchema): Promise<void> {
        const resolved = await imageResolver.startResolving(schema);
        if (resolved) {
            componentsStore.loadSchema(resolved, { resetHistory: true });
            showToast(t('bricks.publish.toasts.schemaImported'), 'success');
        }
    }
    // #endregion

    return {
        sidebarStore,
        historyStore,
        publishStore,
        componentLibraryList,
        isPublishedPagesModalOpen,
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
        showToast,
        handleToggleLibrary,
        handleToggleProperties,
        handleToggleSchema,
        handleOpenPublishSettings,
        handleOpenPublishedPages,
        handleClosePublishedPagesModal,
        handleOpenDocs,
        handleCloseDocs,
        handleEditPage,
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
        isImageResolverModalOpen: imageResolver.isModalOpen,
        imageResolverState: imageResolver.state,
        handleImportSchema,
        handleImageResolverConfirm: imageResolver.handleConfirm,
        handleImageResolverCancel: imageResolver.handleCancel,
        handleImageResolverSkip: imageResolver.handleSkip,
        handleSetImageAction: imageResolver.setImageAction,
        handleSetGlobalAction: imageResolver.setGlobalAction,
    };
}
