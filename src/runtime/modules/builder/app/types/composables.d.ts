/**
 * Типы для composables.
 */

import type { IComponentLibraryItem, IBricksSchema } from '../../../common/types/brick';
import type { ComputedRef, Ref } from 'vue';
import type { useSidebarStore } from '../../core/stores/sidebar';
import type { useHistoryStore } from '../../core/stores/history';
import type { usePublishStore } from '../../publish/stores/publish';
import type { IMediaItem, TMediaGalleryContext } from '../../../common/types/media';
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
 * Элемент списка bricks из mock-api `/mock-api/bricks-components/`.
 */
export interface IBrickListItem {
    name: string;
    category?: string;
    brickPath: string;
}

/**
 * Ответ mock-api со списком bricks.
 */
export interface IBricksResponse {
    bricks: IBrickListItem[];
}
// #endregion

// #region useBuilderSession / useBuilderDraftPersistence
/**
 * Опции composable useBuilderSession.
 */
export interface IBuilderSessionOptions {
    routePagename: ComputedRef<string>;
    showToast: TShowToast;
}

/**
 * Опции composable useBuilderDraftPersistence.
 */
export interface IBuilderDraftPersistenceOptions {
    routePagename: ComputedRef<string>;
    isSessionLoading: Ref<boolean>;
    savedSnapshot: Ref<IBuilderDraftSnapshot | null>;
    buildCurrentSnapshot: () => IBuilderDraftSnapshot;
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
    historyStore: ReturnType<typeof useHistoryStore>;
    publishStore: ReturnType<typeof usePublishStore>;
    componentLibraryList: ComputedRef<IComponentLibraryItem[]>;
    isDocumentationModalOpen: Ref<boolean>;
    isMediaGalleryModalOpen: Ref<boolean>;
    mediaGalleryContext: Ref<TMediaGalleryContext>;
    sidebarRef: Ref<ISidebarExpose | null>;
    toast: IBuilderToastState;
    isEditingExistingPage: ComputedRef<boolean>;
    hasSelectedComponent: ComputedRef<boolean>;
    leftSidebarOffset: ComputedRef<string>;
    currentPublishPageTitle: ComputedRef<string>;
    handleKeyDown: (event: KeyboardEvent) => void;
    showToast: TShowToast;
    handleToggleLibrary: () => void;
    handleToggleProperties: () => void;
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
    handleUndo: () => void;
    handleRedo: () => void;
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
