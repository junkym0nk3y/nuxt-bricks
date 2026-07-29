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
import { useModals } from './useModals';
import { useComponentLibrary } from './useComponentLibrary';
import { useBuilderShortcuts } from './useBuilderShortcuts';
import { useBuilderToast } from '../../core/composables/useBuilderToast';
import { usePageThumbnail } from './usePageThumbnail';
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
    const { loadModals } = useModals();
    const bricksConfig = useBricksConfig();

    // Кэшируем backgroundColor для использования в store (вне Vue контекста)
    setPublishStoreBackgroundColor(bricksConfig.backgroundColor || '#FFFFFF');

    provide('dragComposable', dragComposable);

    // Загружаем модалки при старте билдера (не блокируя setup)
    loadModals();

    const imageResolver = useSchemaImageResolver();
    const { startPreviewSync } = usePreviewSync(sessionToken);
    const { previewCurrentPage } = usePublishPreview();
    const { captureAndUploadThumbnail } = usePageThumbnail(sessionToken);
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
    // лежит вне `inert`-барьера рабочей области (BM-23) и переживает смену сессии
    let mediaGalleryToken: number | null = null;
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
        const startedIn = sessionToken.capture();
        const result = await publishStore.publishCurrentPage(schema, {
            isInitiatorCurrent: () => sessionToken.isCurrent(startedIn),
        });

        // Сохранение прежней страницы, доехавшее после открытия новой, её состояния
        // не касается: `startEditingPage` переписал бы форму, `commitSavedSnapshot`
        // объявил бы её черновик лишним и удалил его, снимок превью снял бы чужой
        // канвас, а `renameSession` увёл бы URL. Факт записи при этом сообщаем —
        // страница пользователя действительно сохранена (BM-26)
        const isCurrent = sessionToken.isCurrent(startedIn);

        if (result !== null) {
            showToast(successMessage, 'success');

            if (!isCurrent) {
                return true;
            }

            if (publishStore.editingPageId === null) {
                publishStore.startEditingPage(result);
            }

            // Fire-and-forget: превью страницы для дашборда, сохранение не блокируем
            captureAndUploadThumbnail(result, startedIn);

            const currentPagename = publishStore.currentFormState.pagename;
            if (currentPagename) {
                // Переносим сессию на сохранённый pagename (URL + ключ черновиков),
                // затем фиксируем снапшот и подчищаем черновик по актуальному ключу.
                // Токен передаётся внутрь: `renameSession` ждёт `router.replace`, и
                // перехваченная за это время навигация сделала бы фиксацию чужой
                await renameSession(currentPagename);
                commitSavedSnapshot(startedIn);
            }
            return true;
        }

        const errorMessage = publishStore.generalError || t('bricks.publish.toasts.savePageFailed');
        showToast(errorMessage, 'error');

        if (!isCurrent) {
            return false;
        }

        publishStore.setCurrentFormField('published', previousPublished);
        ensurePublishSettingsVisible(errorMessage);
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
     * Единый переход сессии (`switchToSavedPage`, фиксированный порядок: store в
     * edit mode → renameSession → savedSnapshot) выполняется до toast/thumbnail —
     * иначе URL и ключ черновика localStorage остаются от оригинала (P1: автосейв
     * копии писал бы контент под slug оригинала, reload оригинала предлагал бы
     * восстановить чужие данные).
     */
    async function handleSaveAsCopy(): Promise<void> {
        const schema = componentsStore.exportSchema();
        const startedIn = sessionToken.capture();
        const copy = await publishStore.saveCurrentPageAsCopy(schema, {
            isInitiatorCurrent: () => sessionToken.isCurrent(startedIn),
        });

        const isCurrent = sessionToken.isCurrent(startedIn);

        if (copy === null) {
            const errorMessage = publishStore.generalError || t('bricks.publish.toasts.copyFailed');
            showToast(errorMessage, 'error');

            if (isCurrent) {
                ensurePublishSettingsVisible(errorMessage);
            }
            return;
        }

        const copySavedMessage = t('bricks.publish.toasts.copySaved');

        // Пользователь ушёл на другую страницу, пока летел POST: копия создана и
        // уже в списке — факт сообщаем, но переводить на неё чужую сессию нельзя,
        // а снимок превью снял бы чужой канвас (BM-26)
        if (!isCurrent) {
            showToast(copySavedMessage, 'success');
            return;
        }

        await switchToSavedPage(copy);
        showToast(copySavedMessage, 'success');

        // Fire-and-forget: у копии свой S3-ключ превью — снимаем сразу после сохранения.
        // Токен — от старта Save as Copy: `switchToSavedPage` выше ждёт
        // `router.replace`, и перехваченная за это время навигация иначе дала бы
        // съёмку чужого канваса под id копии (BM-26, раунд 2 ревью)
        captureAndUploadThumbnail(copy.id, startedIn);
    }

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
        // другой странице — как у модалки восстановления в BM-23
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
    // барьер `inert` из BM-23 их не закрывает и они переживают смену сессии:
    // резолвер импорта, открытый на странице A, подтверждается уже на B и кладёт
    // её схему на чужой канвас; галерея тем же путём пишет `socialImage` или проп
    // компонента через контекст выбора прежней страницы; inline-редактирование
    // остаётся привязанным к компоненту, которого на новом канвасе нет
    // (`loadSchema` сбрасывает только `selectedComponent`). Проверки готовности
    // здесь мало — к моменту подтверждения новая сессия уже готова, — поэтому
    // открытие сессии гасит их явно (BM-26).
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
        // бы на канвас новой (BM-26)
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
    const { componentLibraryList } = await useComponentLibrary();

    return {
        sidebarStore,
        publishStore,
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
