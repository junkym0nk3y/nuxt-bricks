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

/**
 * Функция показа toast-уведомления билдера.
 */
export type TShowToast = (
    message: string,
    variant?: 'success' | 'error',
    duration?: number
) => void;

// #region useComponentLibrary
/**
 * Элемент списка bricks из `GET /api/bricks/components`.
 */
export interface IBrickListItem {
    name: string;
    category?: string;
    brickPath: string;
}

/**
 * Ответ библиотеки компонентов со списком bricks.
 */
export interface IBricksResponse {
    bricks: IBrickListItem[];
}
// #endregion

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
 * Опции composable useBuilderSession.
 */
export interface IBuilderSessionOptions {
    routePagename: ComputedRef<string>;
    sessionPagename: Ref<string>;
    showToast: TShowToast;
    renameSession: TRenameBuilderSession;
}

/**
 * Опции composable useBuilderDraftPersistence.
 */
export interface IBuilderDraftPersistenceOptions {
    sessionPagename: Ref<string>;
    isSessionLoading: Ref<boolean>;
    isRestoreDraftModalOpen: Ref<boolean>;
    savedSnapshot: Ref<IBuilderDraftSnapshot | null>;
    buildCurrentSnapshot: () => IBuilderDraftSnapshot;
}

/**
 * Опции composable useBuilderPagenameSync.
 */
export interface IBuilderPagenameSyncOptions {
    renameSession: TRenameBuilderSession;
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
    captureAndUploadThumbnail: (pageId: string | number) => Promise<void>;
}
// #endregion

// #region useBuilderPage
/**
 * Мост media-запросов inline-редактора (editor → media-галерея).
 * Собирается composition root'ом из editor-store, чтобы builder-ядро не импортировало editor.
 */
export interface IInlineMediaBridge {
    isRequestingMedia: ComputedRef<boolean>;
    resolveMediaRequest: (item: IMediaItem) => void;
    cancelMediaRequest: () => void;
}

/**
 * Возвращаемое значение composable useBuilderPage.
 */
export interface IUseBuilderPageReturn {
    sidebarStore: ReturnType<typeof useSidebarStore>;
    publishStore: ReturnType<typeof usePublishStore>;
    componentLibraryList: ComputedRef<IComponentLibraryItem[]>;
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
