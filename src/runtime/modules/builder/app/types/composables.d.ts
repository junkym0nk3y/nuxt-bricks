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

// #region useComponentLibrary
/**
 * Данные библиотеки компонентов в кеше `useAsyncData('bricks-components')`:
 * готовый список и хеш манифеста, с которым пришёл ответ ручки. Хеш лежит рядом
 * со списком, чтобы сверять было с чем — заготовка под BM-19, потребителя у поля
 * пока нет.
 *
 * Строгого соответствия между `hash` и метаданными внутри `items` до BM-19 нет:
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
}

/**
 * Возвращаемое значение composable useComponentLibrary.
 */
export interface IUseComponentLibraryReturn {
    componentLibraryList: ComputedRef<IComponentLibraryItem[]>;
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
