/**
 * Типы для composables.
 */

import type { IComponentLibraryItem, IBricksSchema } from '../../../common/types/brick';
import type { ComputedRef, Ref } from 'vue';
import type { useSidebarStore } from '../../core/stores/sidebar';
import type { usePublishStore } from '../../publish/stores/publish';
import type { IMediaItem, TMediaGalleryContext } from '../../../common/types/media';
import type { IPublishedPage } from '../../../common/types/bricks-api';
import type { ISidebarExpose } from './builder';
import type {
    IImageResolverState,
    TImageResolveAction,
} from '../../media/types/schemaImageResolver';
import type { IBuilderDraftSnapshot } from '../../publish/types/builderDrafts';
import type { IBuilderToastState } from '../../core/types/toast';
import type { TCachedModal } from '../../core/types/modals';

/**
 * Функция показа toast-уведомления билдера.
 */
export type TShowToast = (
    message: string,
    variant?: 'success' | 'error',
    duration?: number
) => void;

// #region useBuilderPagename / useBuilderSession / useBuilderDraftPersistence
/**
 * Переносит открытую сессию билдера на новый pagename:
 * миграция черновика localStorage + синхронизация URL через Vue Router.
 */
export type TRenameBuilderSession = (next: string) => Promise<void>;

/**
 * Единый переход сессии на сохранённую страницу (Save as Copy): store в edit mode
 * → renameSession (route + sessionPagename + миграция черновика) → фиксация
 * savedSnapshot. Реализация — `useBuilderSession.switchToSavedPage`; toast/thumbnail
 * после resolve — ответственность вызывающего (`useBuilderPage.handleSaveAsCopy`).
 */
export type TSwitchToSavedPage = (page: IPublishedPage) => Promise<void>;

/**
 * Возвращаемое значение composable useBuilderPagename.
 */
export interface IUseBuilderPagenameReturn {
    routePagename: ComputedRef<string>;
    sessionPagename: Ref<string>;
    renameSession: TRenameBuilderSession;
}

/**
 * Токен сессии билдера: снимается операцией на старте и сверяется перед
 * применением результата и побочных эффектов. Реализация —
 * `useBuilderSessionToken`; инкременты принадлежат только `useBuilderSession`.
 */
export interface IBuilderSessionToken {
    /** Текущее значение — для watch'ей сброса поверхностей, переживающих сессию. */
    token: ComputedRef<number>;
    /** Снимает токен на старте операции. */
    capture: () => number;
    /** Актуальна ли сессия, в которой операция началась. */
    isCurrent: (captured: number) => boolean;
    /** Гасит все начатые операции: новое открытие сессии, dispose экземпляра. */
    invalidate: () => void;
}

/**
 * Фиксирует текущее состояние сессии как сохранённое: новый `savedSnapshot` и
 * удаление черновика по актуальному ключу. Реализация —
 * `useBuilderSession.commitSavedSnapshot`; зовётся явно из обоих путей записи
 * (обычное сохранение и переход на копию). Принимает токен сессии,
 * снятый на старте сохранения, и сверяет его сам — между проверкой у вызывающего
 * и фиксацией стоит `await renameSession`.
 */
export type TCommitSavedSnapshot = (capturedToken: number) => void;

/**
 * Опции composable useBuilderSession.
 */
export interface IBuilderSessionOptions {
    routePagename: ComputedRef<string>;
    sessionPagename: Ref<string>;
    showToast: TShowToast;
    renameSession: TRenameBuilderSession;
    sessionToken: IBuilderSessionToken;
}

/**
 * Опции composable useBuilderDraftPersistence.
 */
export interface IBuilderDraftPersistenceOptions {
    routePagename: ComputedRef<string>;
    sessionPagename: Ref<string>;
    isSessionLoading: Ref<boolean>;
    isSessionReady: Ref<boolean>;
    isRestoreDraftModalOpen: Ref<boolean>;
    savedSnapshot: Ref<IBuilderDraftSnapshot | null>;
    buildCurrentSnapshot: () => IBuilderDraftSnapshot;
}

/**
 * Опции composable useBuilderPagenameSync.
 */
export interface IBuilderPagenameSyncOptions {
    renameSession: TRenameBuilderSession;
    isSessionReady: Ref<boolean>;
}
// #endregion

// #region useComponentLibrary
/**
 * Данные библиотеки компонентов в кеше `useAsyncData('bricks-components')`:
 * готовый список и хеш манифеста, с которым пришёл ответ ручки. Хеш лежит рядом
 * со списком, чтобы сверять было с чем — заготовка под сверку хешей в dev,
 * потребителя у поля пока нет.
 *
 * Строгого соответствия между `hash` и метаданными внутри `items` пока нет:
 * `name`, `category` и `brickPath` приходят из того же ответа, а `description`,
 * `defaultProps` и `slots` — из импорта brick-модуля, который в dev может
 * отставать на одну загрузку страницы (Vite инвалидирует brick-файл позже, чем
 * уходит сигнал перезагрузки).
 */
export interface IComponentLibraryData {
    /** Хеш манифеста brick-компонентов из ответа ручки компонентов. */
    hash: string;
    /** Layout-блоки + brick-компоненты с метаданными. */
    items: IComponentLibraryItem[];
    /**
     * Модалки того же манифеста — для кеша селектора свойств. Лежат в кеше
     * `useAsyncData` рядом со списком, потому что на гидрации handler не
     * исполняется: только из его результата их и можно взять на клиенте.
     */
    modals: TCachedModal[];
}

/**
 * Возвращаемое значение composable useComponentLibrary.
 */
export interface IUseComponentLibraryReturn {
    componentLibraryList: ComputedRef<IComponentLibraryItem[]>;
    /**
     * Отказ загрузки манифеста. Отдельно от пустого списка: layout-блоки
     * остаются доступны и при отказе, то есть по составу списка отказ неотличим.
     */
    isComponentLibraryLoadFailed: ComputedRef<boolean>;
    isComponentLibraryLoading: ComputedRef<boolean>;
    /** Повторяет загрузку; возвращает признак успеха. */
    refreshComponentLibrary: () => Promise<boolean>;
}
// #endregion

// #region usePageThumbnail
/**
 * Ответ POST /api/bricks/media/s3-page-thumbnail.
 */
export interface IThumbnailUploadResponse {
    success: boolean;
    url: string;
}

/**
 * Возвращаемое значение composable usePageThumbnail.
 */
export interface IUsePageThumbnailReturn {
    captureAndUploadThumbnail: (pageId: string | number, startedIn: number) => Promise<void>;
}
// #endregion

// #region useBuilderPageWrite
/**
 * Опции composable useBuilderPageWrite: всё, что принадлежит composition root'у,
 * а не самой записи — токен сессии, её перенос и фиксация, открытие панели
 * публикации для подсветки полей.
 */
export interface IBuilderPageWriteOptions {
    sessionToken: IBuilderSessionToken;
    renameSession: TRenameBuilderSession;
    switchToSavedPage: TSwitchToSavedPage;
    commitSavedSnapshot: TCommitSavedSnapshot;
    ensurePublishSettingsVisible: (message: string) => void;
}

/**
 * Возвращаемое значение composable useBuilderPageWrite.
 */
export interface IUseBuilderPageWriteReturn {
    isEditingExistingPage: ComputedRef<boolean>;
    currentPublishPageTitle: ComputedRef<string>;
    handleSaveDraft: () => Promise<void>;
    handleSaveAsCopy: () => Promise<void>;
}
// #endregion

// #region useBuilderPage
/**
 * Мост inline-редактора (editor → media-галерея и сброс сессии).
 * Собирается composition root'ом из editor-store, чтобы builder-ядро не импортировало editor.
 */
export interface IInlineMediaBridge {
    isRequestingMedia: ComputedRef<boolean>;
    resolveMediaRequest: (item: IMediaItem) => void;
    cancelMediaRequest: () => void;
    /**
     * Гасит inline-редактирование. Его состояние переживает смену схемы канваса:
     * `loadSchema` сбрасывает только `selectedComponent`, а `componentId` и
     * экземпляр редактора остаются от компонента, которого на новом канвасе
     * уже нет.
     */
    cancelInlineEditing: () => void;
}

/**
 * Опции composable useBuilderPage.
 */
export interface IBuilderPageOptions {
    inlineMediaBridge: IInlineMediaBridge;
    renameSession: TRenameBuilderSession;
    switchToSavedPage: TSwitchToSavedPage;
    commitSavedSnapshot: TCommitSavedSnapshot;
    sessionToken: IBuilderSessionToken;
}

/**
 * Возвращаемое значение composable useBuilderPage.
 */
export interface IUseBuilderPageReturn {
    sidebarStore: ReturnType<typeof useSidebarStore>;
    publishStore: ReturnType<typeof usePublishStore>;
    componentLibraryList: ComputedRef<IComponentLibraryItem[]>;
    isComponentLibraryLoadFailed: ComputedRef<boolean>;
    isComponentLibraryLoading: ComputedRef<boolean>;
    handleRetryComponentLibrary: () => Promise<void>;
    /**
     * Сообщает об отказе загрузки библиотеки тостом. Зовётся страницей из
     * `onMounted`: composable await'ится и на SSR, где показывать его некому.
     */
    notifyComponentLibraryFailure: () => void;
    isDocumentationModalOpen: Ref<boolean>;
    isMediaGalleryModalOpen: Ref<boolean>;
    mediaGalleryContext: Ref<TMediaGalleryContext>;
    sidebarRef: Ref<ISidebarExpose | null>;
    propertiesPanelRef: Ref<ISidebarExpose | null>;
    toast: IBuilderToastState;
    isEditingExistingPage: ComputedRef<boolean>;
    hasSelectedComponent: ComputedRef<boolean>;
    leftSidebarOffset: ComputedRef<string>;
    currentPublishPageTitle: ComputedRef<string>;
    handleKeyDown: (event: KeyboardEvent) => void;
    showToast: TShowToast;
    handleToggleLibrary: () => void;
    handleToggleSchema: () => void;
    handleOpenPublishSettings: () => void;
    handleOpenDocs: () => void;
    handleCloseDocs: () => void;
    handleMediaError: (message: string) => void;
    handleOpenMediaGallery: (context?: TMediaGalleryContext) => void;
    handleCloseMediaGallery: () => void;
    handleMediaSelect: (item: IMediaItem) => void;
    handleSaveDraft: () => Promise<void>;
    handleSaveAsCopy: () => Promise<void>;
    handlePreview: () => Promise<void>;
    isImageResolverModalOpen: Ref<boolean>;
    imageResolverState: IImageResolverState;
    handleImportSchema: (schema: IBricksSchema) => Promise<void>;
    handleImageResolverConfirm: () => void;
    handleImageResolverCancel: () => void;
    handleImageResolverSkip: () => void;
    handleSetImageAction: (url: string, action: TImageResolveAction) => void;
    handleSetGlobalAction: (action: TImageResolveAction) => void;
}
// #endregion
