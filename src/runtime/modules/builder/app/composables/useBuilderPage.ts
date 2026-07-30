// #region Imports
// Types
import type { IBricksSchema } from '../../../common/types/brick';
import type { IMediaItem, TMediaGalleryContext } from '../../../common/types/media';
import type { ISidebarExpose } from '../types/builder';
import type { IBuilderPageOptions, IUseBuilderPageReturn } from '../types/composables';

// Utils
import { setPublishStoreBackgroundColor } from '../../publish/utils/formState';

// Vue
import { computed, provide, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useComponentLibraryDrag } from './useDraggableComponent';
import { useComponentLibrary } from './useComponentLibrary';
import { useBuilderPageWrite } from './useBuilderPageWrite';
import { useBuilderShortcuts } from './useBuilderShortcuts';
import { useBuilderToast } from '../../core/composables/useBuilderToast';
import { usePreviewSync } from './usePreviewSync';
import { usePublishPreview } from '../../publish/composables/usePublishPreview';
import { useBricksConfig } from '../../../common/composables/useBricksConfig';
import { useSchemaImageResolver } from '../../media/composables/useSchemaImageResolver';

// Pinia
import { useComponentsStore } from '../../core/stores/components';
import { useSidebarStore } from '../../core/stores/sidebar';
import { usePublishStore } from '../../publish/stores/publish';
// #endregion

/**
 * Собирает всю бизнес-логику страницы билдера и отдаёт Vue-компоненту только необходимые состояния.
 *
 * @param options - Мост inline-редактора, перенос и фиксация сессии, токен сессии;
 * всё собирается composition root'ом (`pages/[pagename].vue`), чтобы builder-ядро
 * не зависело от editor и владело сессией в одном месте.
 */
export async function useBuilderPage(options: IBuilderPageOptions): Promise<IUseBuilderPageReturn> {
    const {
        inlineMediaBridge,
        renameSession,
        switchToSavedPage,
        commitSavedSnapshot,
        sessionToken,
    } = options;

    // #region Stores & Composables
    const { t } = useI18n();
    const componentsStore = useComponentsStore();
    const sidebarStore = useSidebarStore();
    const publishStore = usePublishStore();
    const dragComposable = useComponentLibraryDrag();
    const bricksConfig = useBricksConfig();

    // Кэшируем backgroundColor для использования в store (вне Vue контекста)
    setPublishStoreBackgroundColor(bricksConfig.backgroundColor || '#FFFFFF');

    provide('dragComposable', dragComposable);

    const imageResolver = useSchemaImageResolver();
    const { startPreviewSync } = usePreviewSync(sessionToken);
    const { previewCurrentPage } = usePublishPreview();
    const { handleKeyDown } = useBuilderShortcuts();
    const { toast, showToast } = useBuilderToast();
    // #endregion

    // #region State
    const isDocumentationModalOpen = ref(false);
    const isMediaGalleryModalOpen = ref(false);
    const mediaGalleryContext = ref<TMediaGalleryContext>('manager');
    const sidebarRef = ref<ISidebarExpose | null>(null);
    const propertiesPanelRef = ref<ISidebarExpose | null>(null);

    // Токен сессии, в которой открыли галерею: выбор применяется к панели свойств
    // и сайдбару текущей страницы, а сама галерея телепортирована в body — то есть
    // лежит вне `inert`-барьера рабочей области и переживает смену сессии
    let mediaGalleryToken: number | null = null;
    // #endregion

    // #region Computed
    const hasSelectedComponent = computed(() => Boolean(componentsStore.selectedComponent));
    const leftSidebarOffset = computed(() =>
        sidebarStore.left.visible ? sidebarStore.left.width : '0px'
    );
    // #endregion

    // #region Sidebar toggles
    /**
     * Переключает видимость библиотеки компонентов в сайдбаре.
     */
    function handleToggleLibrary(): void {
        sidebarStore.toggleSidebarView('components');
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

    const { isEditingExistingPage, currentPublishPageTitle, handleSaveDraft, handleSaveAsCopy } =
        useBuilderPageWrite({
            sessionToken,
            renameSession,
            switchToSavedPage,
            commitSavedSnapshot,
            ensurePublishSettingsVisible,
        });

    /**
     * Открывает превью текущего лендинга в новой вкладке.
     * После открытия запускает синхронизацию — изменения на канвасе будут отражаться в превью в реальном времени.
     */
    async function handlePreview(): Promise<void> {
        const schema = componentsStore.exportSchema();
        const previewPagename = previewCurrentPage(schema);

        if (previewPagename && import.meta.client) {
            startPreviewSync(previewPagename);
        } else if (!previewPagename) {
            showToast(
                publishStore.generalError || t('bricks.publish.toasts.previewFailed'),
                'error'
            );
        }
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
        mediaGalleryToken = sessionToken.capture();
        isMediaGalleryModalOpen.value = true;
    }

    /**
     * Закрывает модальное окно медиа-галереи.
     */
    function handleCloseMediaGallery(): void {
        isMediaGalleryModalOpen.value = false;
        mediaGalleryContext.value = 'manager';
        mediaGalleryToken = null;
        inlineMediaBridge.cancelMediaRequest();
    }

    /**
     * Обрабатывает выбор медиа-элемента из галереи.
     * Передаёт выбранный элемент в панель свойств, сайдбар или inline editor и закрывает галерею.
     *
     * @param item - Выбранный медиа-элемент.
     */
    function handleMediaSelect(item: IMediaItem): void {
        // Второй барьер к сбросу ниже: уезжающая модалка ещё может отдать клик, а
        // цели выбора (панель свойств, сайдбар, inline-редактор) принадлежат уже
        // другой странице — как и у модалки восстановления черновика
        if (mediaGalleryToken !== null && !sessionToken.isCurrent(mediaGalleryToken)) {
            handleCloseMediaGallery();
            return;
        }

        if (inlineMediaBridge.isRequestingMedia.value) {
            inlineMediaBridge.resolveMediaRequest(item);
            isMediaGalleryModalOpen.value = false;
            mediaGalleryContext.value = 'manager';
            mediaGalleryToken = null;
            return;
        }

        if (mediaGalleryContext.value === 'properties') {
            propertiesPanelRef.value?.handleMediaSelect(item);
        } else {
            sidebarRef.value?.handleMediaSelect(item);
        }
        isMediaGalleryModalOpen.value = false;
        mediaGalleryContext.value = 'manager';
        mediaGalleryToken = null;
    }

    // Открываем MediaGallery когда inline editor запрашивает изображение
    watch(inlineMediaBridge.isRequestingMedia, (requesting) => {
        if (requesting) {
            handleOpenMediaGallery('properties');
        }
    });
    // #endregion

    // #region Session reset
    // Поверхности, телепортированные в body, лежат вне `.workspace`, поэтому
    // барьер `inert` рабочей области их не закрывает и они переживают смену сессии:
    // резолвер импорта, открытый на странице A, подтверждается уже на B и кладёт
    // её схему на чужой канвас; галерея тем же путём пишет `socialImage` или проп
    // компонента через контекст выбора прежней страницы; inline-редактирование
    // остаётся привязанным к компоненту, которого на новом канвасе нет
    // (`loadSchema` сбрасывает только `selectedComponent`). Проверки готовности
    // здесь мало — к моменту подтверждения новая сессия уже готова, — поэтому
    // открытие сессии гасит их явно.
    //
    // flush: 'sync' — сброс обязан произойти в момент инвалидации токена, а не на
    // следующем тике: `openBuilderSession` сразу уходит в await, и отложенный
    // колбэк выполнился бы уже вперемешку с bootstrap'ом новой страницы.
    watch(
        sessionToken.token,
        () => {
            imageResolver.handleCancel();
            inlineMediaBridge.cancelInlineEditing();
            handleCloseMediaGallery();
        },
        { flush: 'sync' }
    );
    // #endregion

    // #region Schema import with image resolving
    /**
     * Импортирует JSON-схему с предварительным резолвингом изображений.
     * Если найдены новые изображения — показывает модалку с выбором действий.
     *
     * @param schema - Импортируемая схема.
     */
    async function handleImportSchema(schema: IBricksSchema): Promise<void> {
        const startedIn = sessionToken.capture();
        const resolved = await imageResolver.startResolving(schema);

        // Сброса выше недостаточно: до показа модалки резолвер ждёт загрузку
        // медиа-галереи, и если новых изображений в схеме нет, он возвращает её без
        // модалки вовсе — гасить в этом окне нечего, а схема прежней страницы легла
        // бы на канвас новой
        if (!resolved || !sessionToken.isCurrent(startedIn)) {
            return;
        }

        componentsStore.loadSchema(resolved, { resetHistory: true });
        showToast(t('bricks.publish.toasts.schemaImported'), 'success');
    }
    // #endregion

    // Единственный await composable'а — и он последний. После него активный
    // effect scope теряется (`getCurrentScope()` → undefined), а `watch`,
    // зарегистрированный в потерянном scope, не останавливается на unmount:
    // каждый повторный заход в билдер оставлял бы живое замыкание на мёртвые refs,
    // и мутация глобального стора дёргала бы обработчики всех прошлых экземпляров.
    // Поэтому вся синхронная проводка (включая оба watcher'а) идёт выше, а
    // библиотека компонентов дожидается здесь — её значение нужно только в return.
    const {
        componentLibraryList,
        isComponentLibraryLoadFailed,
        isComponentLibraryLoading,
        refreshComponentLibrary,
    } = await useComponentLibrary();

    /**
     * Повторяет загрузку библиотеки по кнопке сайдбара; повторный отказ снова
     * сообщается тостом — сама кнопка остаётся на месте.
     */
    async function handleRetryComponentLibrary(): Promise<void> {
        const isLoaded = await refreshComponentLibrary();

        if (!isLoaded) {
            showToast(t('bricks.library.loadFailed'), 'error');
        }
    }

    /**
     * Сообщает об отказе загрузки библиотеки. Показ не делается здесь же, а отдан
     * странице (её `onMounted`): composable await'ится в setup, в том числе на
     * SSR, где показывать тост некому, а сам toast принадлежит странице — она же
     * владеет его монтированием.
     *
     * Тост нужен вместе с блоком повтора в сайдбаре, а не вместо него: блок
     * виден только при открытой библиотеке, то есть об отказе иначе можно узнать
     * лишь случайно.
     */
    function notifyComponentLibraryFailure(): void {
        if (isComponentLibraryLoadFailed.value) {
            showToast(t('bricks.library.loadFailed'), 'error');
        }
    }

    return {
        sidebarStore,
        publishStore,
        componentLibraryList,
        isComponentLibraryLoadFailed,
        isComponentLibraryLoading,
        handleRetryComponentLibrary,
        notifyComponentLibraryFailure,
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
        showToast,
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
