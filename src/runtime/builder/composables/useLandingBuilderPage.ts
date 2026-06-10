// #region Imports
// Types
import type { ComponentLibraryItem, LandingSchema } from '../../types/landing';
import type { IMediaItem, TMediaGalleryContext } from '../../media/types/media';
import type { IBuilderSidebarExpose } from '../types/builder';
import type { IBuilderToastState, IUseLandingBuilderPageReturn } from '../types/composables';

// Vue
import { computed, onUnmounted, provide, reactive, ref, watch } from 'vue';

// Nuxt
import { useAsyncData } from '#imports';

// Composables
import { useApiClient } from '../../composables/useApiClient';
import { useStoryImports } from '../../composables/useStoryImports';
import { useComponentLibraryDrag } from './useDraggableComponent';
import { useModals } from './useModals';
import { useLandingConfig } from '../../composables/useLandingConfig';
import { useSchemaImageResolver } from '../../media/composables/useSchemaImageResolver';

// Pinia
import { useLandingComponentsStore } from '../../stores/landing/components';
import { useLandingSidebarStore } from '../../stores/landing/sidebar';
import { useLandingHistoryStore } from '../../stores/landing/history';
import { useLandingInlineEditingStore } from '../../stores/landing/inlineEditing';
import { usePublishStore, setPublishStoreBackgroundColor } from '../stores/publish';

// Constants
import { LAYOUT_COMPONENTS } from '../constants/layoutComponents';
// #endregion

/**
 * Собирает всю бизнес-логику страницы билдера и отдаёт Vue-компоненту только необходимые состояния.
 */
export async function useLandingBuilderPage(): Promise<IUseLandingBuilderPageReturn> {
    // #region Stores & Composables
    const componentsStore = useLandingComponentsStore();
    const sidebarStore = useLandingSidebarStore();
    const historyStore = useLandingHistoryStore();
    const inlineEditingStore = useLandingInlineEditingStore();
    const publishStore = usePublishStore();
    const { findImportModule } = useStoryImports();
    const dragComposable = useComponentLibraryDrag();
    const { loadModals } = useModals();
    const landingConfig = useLandingConfig();

    // Кэшируем backgroundColor для использования в store (вне Vue контекста)
    setPublishStoreBackgroundColor(landingConfig.backgroundColor || '#FFFFFF');

    provide('dragComposable', dragComposable);
    provide('availableFonts', landingConfig.fonts ?? [landingConfig.defaultFont]);

    // Загружаем модалки при старте билдера (не блокируя setup)
    loadModals();

    const imageResolver = useSchemaImageResolver();
    // #endregion

    // #region Preview sync
    let previewBroadcastChannel: BroadcastChannel | null = null;
    let previewSyncTimer: ReturnType<typeof setTimeout> | null = null;
    let previewPagename = '';

    /**
     * Отправляет актуальную схему канваса в открытую вкладку превью через BroadcastChannel.
     * Параллельно обновляет localStorage, чтобы перезагрузка вкладки показывала свежие данные.
     */
    function sendPreviewSchemaUpdate(): void {
        if (!previewBroadcastChannel || !previewPagename) {
            return;
        }

        const schema = componentsStore.exportSchema();

        if (typeof window !== 'undefined') {
            try {
                const stored = window.localStorage.getItem('landing-preview-page');
                if (stored) {
                    const parsed = JSON.parse(stored) as Record<string, unknown>;
                    if (parsed.pagename === previewPagename) {
                        parsed.schema = schema;
                        window.localStorage.setItem('landing-preview-page', JSON.stringify(parsed));
                    }
                }
            } catch {
                // ignore storage errors
            }
        }

        previewBroadcastChannel.postMessage({
            type: 'schema-update',
            pagename: previewPagename,
            schema,
        });
    }

    /**
     * Открывает BroadcastChannel для синхронизации preview-вкладки.
     *
     * @param pagename - ЧПУ страницы, открытой в превью.
     */
    function startPreviewSync(pagename: string): void {
        if (!import.meta.client) {
            return;
        }

        previewPagename = pagename;

        if (!previewBroadcastChannel) {
            previewBroadcastChannel = new BroadcastChannel('landing-preview-sync');
        }
    }

    // Отправляем обновления схемы в preview при изменении компонентов на канвасе (debounce 300ms)
    watch(
        () => componentsStore.components,
        () => {
            if (!previewBroadcastChannel) {
                return;
            }

            if (previewSyncTimer) {
                clearTimeout(previewSyncTimer);
            }

            previewSyncTimer = setTimeout(() => {
                sendPreviewSchemaUpdate();
                previewSyncTimer = null;
            }, 300);
        },
        { deep: true }
    );

    onUnmounted(() => {
        if (previewSyncTimer) {
            clearTimeout(previewSyncTimer);
            previewSyncTimer = null;
        }
        previewBroadcastChannel?.close();
        previewBroadcastChannel = null;
    });
    // #endregion

    // #region State
    const isPublishedPagesModalOpen = ref(false);
    const isDocumentationModalOpen = ref(false);
    const isMediaGalleryModalOpen = ref(false);
    const mediaGalleryContext = ref<TMediaGalleryContext>('manager');
    const builderSidebarRef = ref<IBuilderSidebarExpose | null>(null);
    const toast = reactive<IBuilderToastState>({
        visible: false,
        message: '',
        variant: 'success',
        duration: 4000,
    });
    // #endregion

    // #region Helpers
    /**
     * Извлекает определения слотов из данных story.
     *
     * @param storyData - Данные story компонента.
     * @returns Нормализованный массив слотов или undefined.
     */
    function extractStorySlots(storyData: any) {
        const rawSlots = storyData?.slots;
        if (!rawSlots) {
            return undefined;
        }

        if (Array.isArray(rawSlots)) {
            const normalized = rawSlots
                .map((slot: any) => {
                    if (typeof slot === 'string') {
                        return {
                            name: slot,
                            label: slot,
                            allowMultiple: true,
                        };
                    }
                    if (slot && typeof slot === 'object' && typeof slot.name === 'string') {
                        return {
                            name: slot.name,
                            label: slot.label ?? slot.name,
                            description: slot.description,
                            allowMultiple:
                                typeof slot.allowMultiple === 'boolean' ? slot.allowMultiple : true,
                        };
                    }
                    return null;
                })
                .filter(Boolean);
            return normalized.length > 0 ? normalized : undefined;
        }

        if (typeof rawSlots === 'object') {
            const entries = Object.entries(rawSlots).map(([name, config]) => {
                if (config && typeof config === 'object') {
                    return {
                        name,
                        label: (config as any).label ?? name,
                        description: (config as any).description,
                        allowMultiple:
                            typeof (config as any).allowMultiple === 'boolean'
                                ? (config as any).allowMultiple
                                : true,
                    };
                }
                return {
                    name,
                    label: name,
                    allowMultiple: true,
                };
            });
            return entries.length > 0 ? entries : undefined;
        }

        return undefined;
    }
    // #endregion

    // #region Async data
    const componentLibrary = await useAsyncData<(ComponentLibraryItem | null)[] | null>(
        'landing-components',
        async () => {
            const { apiFetcher } = useApiClient();
            const response = await apiFetcher<{ stories: any[] }>('/mock-api/landing-components/');
            const stories = response?.stories || [];

            const componentsWithMeta = await Promise.all(
                stories.map(async (story: any) => {
                    try {
                        const moduleLoader = findImportModule(story.storyPath);
                        if (!moduleLoader) {
                            console.error(`[LandingBuilder] No loader for ${story.storyPath}`);
                            return null;
                        }

                        const module = await moduleLoader();
                        const storyData = module?.story || {};
                        const values = storyData.values || {};
                        const slots = extractStorySlots(storyData);
                        const defaultProps = Object.entries(values).reduce(
                            (acc: Record<string, unknown>, [key, val]: [string, any]) => {
                                acc[key] = val.default;
                                return acc;
                            },
                            {}
                        );

                        return {
                            name: story.name,
                            category: story.category || storyData.category || 'Other',
                            storyPath: story.storyPath,
                            description: storyData.description,
                            thumbnail: '',
                            defaultProps,
                            slots,
                        } as ComponentLibraryItem;
                    } catch (error) {
                        console.error(`[LandingBuilder] Failed loading ${story.name}`, error);
                        return null;
                    }
                })
            );

            return [...LAYOUT_COMPONENTS, ...componentsWithMeta.filter(Boolean)];
        }
    );
    // #endregion

    // #region Computed
    const componentLibraryList = computed<ComponentLibraryItem[]>(() => {
        const list = componentLibrary.data.value;
        return (Array.isArray(list) ? list : []).filter(Boolean) as ComponentLibraryItem[];
    });
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

    // #region Toast helpers
    /**
     * Показывает toast с сообщением и вариантом.
     *
     * @param message - Текст уведомления.
     * @param variant - Тип уведомления.
     */
    function showToast(message: string, variant: 'success' | 'error' = 'success'): void {
        toast.message = message;
        toast.variant = variant;
        toast.duration = 4000;
        toast.visible = false;

        requestAnimationFrame(() => {
            toast.visible = true;
        });
    }

    /**
     * Показывает toast с произвольной длительностью.
     *
     * @param message - Текст уведомления.
     * @param variant - Тип уведомления.
     * @param duration - Длительность показа (мс).
     */
    function showToastWithDuration(
        message: string,
        variant: 'success' | 'error' = 'success',
        duration = 4000
    ): void {
        toast.message = message;
        toast.variant = variant;
        toast.duration = duration;
        toast.visible = false;

        requestAnimationFrame(() => {
            toast.visible = true;
        });
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
    // #endregion

    // #region Keyboard shortcuts
    /**
     * Проверяет, следует ли игнорировать событие клавиатуры.
     * Игнорируются события в полях ввода, текстовых областях и редактируемых элементах.
     *
     * @param target - HTML-элемент, на котором произошло событие.
     * @returns true, если событие следует игнорировать.
     */
    function shouldIgnoreKeyEvent(target: HTMLElement): boolean {
        return (
            target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
        );
    }

    /**
     * Обрабатывает горячую клавишу удаления компонента (Delete/Backspace).
     *
     * @param event - Событие клавиатуры.
     * @returns true, если событие было обработано.
     */
    function handleDeleteShortcut(event: KeyboardEvent): boolean {
        if (event.key !== 'Delete' && event.key !== 'Backspace') {
            return false;
        }
        if (!componentsStore.selectedComponent) {
            return false;
        }
        event.preventDefault();
        componentsStore.removeComponent(componentsStore.selectedComponent.id);
        return true;
    }

    /**
     * Обрабатывает горячую клавишу копирования компонента (Ctrl/Cmd+C).
     *
     * @param event - Событие клавиатуры.
     * @returns true, если событие было обработано.
     */
    function handleCopyShortcut(event: KeyboardEvent): boolean {
        if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'c') {
            return false;
        }
        if (!componentsStore.selectedComponent) {
            return false;
        }
        event.preventDefault();
        componentsStore.copyComponentToClipboard(componentsStore.selectedComponent.id);
        return true;
    }

    /**
     * Обрабатывает горячую клавишу вставки компонента (Ctrl/Cmd+V).
     *
     * @param event - Событие клавиатуры.
     * @returns true, если событие было обработано.
     */
    function handlePasteShortcut(event: KeyboardEvent): boolean {
        if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'v') {
            return false;
        }
        event.preventDefault();
        componentsStore.pasteFromClipboard();
        return true;
    }

    /**
     * Обрабатывает горячие клавиши отмены/повтора действий (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z).
     *
     * @param event - Событие клавиатуры.
     */
    function handleUndoRedoShortcut(event: KeyboardEvent): void {
        if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') {
            return;
        }
        event.preventDefault();
        if (event.shiftKey) {
            componentsStore.redo();
            return;
        }
        componentsStore.undo();
    }

    /**
     * Главный обработчик событий клавиатуры.
     * Делегирует обработку специализированным функциям в зависимости от нажатой клавиши.
     *
     * @param event - Событие клавиатуры.
     */
    function handleKeyDown(event: KeyboardEvent): void {
        const target = event.target as HTMLElement;
        if (shouldIgnoreKeyEvent(target)) {
            return;
        }
        if (handleDeleteShortcut(event)) {
            return;
        }
        if (handleCopyShortcut(event)) {
            return;
        }
        if (handlePasteShortcut(event)) {
            return;
        }
        handleUndoRedoShortcut(event);
    }
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
    async function submitLandingWithPublishState(
        published: boolean,
        successMessage: string
    ): Promise<boolean> {
        const previousPublished = publishStore.currentFormState.published;
        publishStore.setCurrentFormField('published', published);
        const schema = componentsStore.exportSchema();
        const result = await publishStore.publishCurrentLanding(schema);

        if (result !== null) {
            showToast(successMessage, 'success');
            if (publishStore.editingPageId === null) {
                publishStore.startEditingPage(result);
            }

            const currentPagename = publishStore.currentFormState.pagename;
            if (currentPagename) {
                publishStore.removeBuilderDraft(currentPagename);

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
        const errorMessage = publishStore.generalError || 'Не удалось сохранить страницу';
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
                ? 'Страница обновлена'
                : 'Изменения сохранены как черновик'
            : published
              ? 'Страница опубликована'
              : 'Черновик сохранён';
        await submitLandingWithPublishState(published, message);
    }

    /**
     * Сохраняет текущий лендинг как копию с новым ID.
     * После успешного сохранения обновляет список страниц и переключается на редактирование копии.
     */
    async function handleSaveAsCopy(): Promise<void> {
        const schema = componentsStore.exportSchema();
        const result = await publishStore.saveCurrentLandingAsCopy(schema);
        if (result !== null) {
            try {
                await publishStore.loadAllPages();
            } catch (error: unknown) {
                const message =
                    error instanceof Error
                        ? error.message
                        : 'Не удалось обновить список опубликованных страниц';
                showToast(message, 'error');
                return;
            }

            publishStore.startEditingPage(result);
            showToast('Копия страницы сохранена', 'success');
            return;
        }
        const errorMessage = publishStore.generalError || 'Не удалось сохранить копию страницы';
        ensurePublishSettingsVisible(errorMessage);
        showToast(errorMessage, 'error');
    }

    /**
     * Открывает превью текущего лендинга в новой вкладке.
     * После открытия запускает синхронизацию — изменения на канвасе будут отражаться в превью в реальном времени.
     */
    async function handlePreview(): Promise<void> {
        const schema = componentsStore.exportSchema();
        const success = publishStore.previewCurrentLanding(schema);

        if (success && import.meta.client) {
            try {
                const stored = window.localStorage.getItem('landing-preview-page');
                if (stored) {
                    const parsed = JSON.parse(stored) as Record<string, unknown>;
                    startPreviewSync(String(parsed.pagename ?? ''));
                }
            } catch {
                // ignore
            }
        } else if (!success) {
            showToast(publishStore.generalError || 'Не удалось открыть превью', 'error');
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
        inlineEditingStore.cancelMediaRequest();
    }

    /**
     * Обрабатывает выбор медиа-элемента из галереи.
     * Передаёт выбранный элемент в сайдбар (или в inline editor) и закрывает галерею.
     *
     * @param item - Выбранный медиа-элемент.
     */
    function handleMediaSelect(item: IMediaItem): void {
        if (inlineEditingStore.isRequestingMedia) {
            inlineEditingStore.resolveMediaRequest(item);
            isMediaGalleryModalOpen.value = false;
            mediaGalleryContext.value = 'manager';
            return;
        }

        builderSidebarRef.value?.handleMediaSelect(item);
        isMediaGalleryModalOpen.value = false;
        mediaGalleryContext.value = 'manager';
    }

    // Открываем MediaGallery когда inline editor запрашивает изображение
    watch(
        () => inlineEditingStore.isRequestingMedia,
        (requesting) => {
            if (requesting) {
                handleOpenMediaGallery('properties');
            }
        }
    );
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
            console.error('[LandingBuilder] handleEditPage: page not found', pageId);
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
    async function handleImportSchema(schema: LandingSchema): Promise<void> {
        const resolved = await imageResolver.startResolving(schema);
        if (resolved) {
            componentsStore.loadSchema(resolved, { resetHistory: true });
            showToastWithDuration('Схема импортирована', 'success');
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
        builderSidebarRef,
        toast,
        isEditingExistingPage,
        hasSelectedComponent,
        leftSidebarOffset,
        currentPublishPageTitle,
        handleKeyDown,
        showToast: showToastWithDuration,
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
