/**
 * Типы для composables.
 */

import type {
    ComponentSlotDefinition,
    LandingComponent,
    LandingSchema,
    PropertyDefinition,
    ComponentLibraryItem,
} from '../../common/types/landing';
import type {
    ComponentVariantsMap,
    IComponentVariant,
    PropertyEditorType,
} from '../components/sidebar/properties.types';
import type { ComputedRef, CSSProperties, Ref, VNodeRef } from 'vue';
import type { useLandingSidebarStore } from '../stores/sidebar';
import type { useLandingHistoryStore } from '../stores/history';
import type { usePublishStore } from '../stores/publish';
import type { IMediaItem, TMediaGalleryContext } from '../../media/types/media';
import type { ISidebarExpose } from './builder';
import type { IImageResolverState, TImageResolveAction } from '../../media/types/schemaImageResolver';

// #region useComponentSlots
/**
 * Данные для рендеринга слота с дочерними компонентами.
 */
export interface ISlotRenderData {
    slot: ComponentSlotDefinition;
    children: LandingComponent[];
}

/**
 * Возвращаемое значение composable useComponentSlots.
 */
export interface IUseComponentSlotsReturn {
    slotRenderData: ComputedRef<ISlotRenderData[]>;
    slotStringContent: ComputedRef<string>;
    hasLoadedSlots: Ref<boolean>;
}
// #endregion

// #region useLandingBuilderPage
/**
 * Состояние toast-уведомления.
 */
export interface IBuilderToastState {
    visible: boolean;
    message: string;
    variant: 'success' | 'error';
    duration?: number;
}

/**
 * Возвращаемое значение composable useLandingBuilderPage.
 */
export interface IUseLandingBuilderPageReturn {
    sidebarStore: ReturnType<typeof useLandingSidebarStore>;
    historyStore: ReturnType<typeof useLandingHistoryStore>;
    publishStore: ReturnType<typeof usePublishStore>;
    componentLibraryList: ComputedRef<ComponentLibraryItem[]>;
    isPublishedPagesModalOpen: Ref<boolean>;
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
    showToast: (message: string, variant?: 'success' | 'error', duration?: number) => void;
    handleToggleLibrary: () => void;
    handleToggleProperties: () => void;
    handleToggleSchema: () => void;
    handleOpenPublishSettings: () => void;
    handleOpenPublishedPages: () => void;
    handleClosePublishedPagesModal: () => void;
    handleOpenDocs: () => void;
    handleCloseDocs: () => void;
    handleEditPage: (pageId: string) => void;
    handlePublishedPagesError: (message: string) => void;
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
    handleImportSchema: (schema: LandingSchema) => Promise<void>;
    handleImageResolverConfirm: () => void;
    handleImageResolverCancel: () => void;
    handleImageResolverSkip: () => void;
    handleSetImageAction: (url: string, action: TImageResolveAction) => void;
    handleSetGlobalAction: (action: TImageResolveAction) => void;
}
// #endregion

// #region usePropertyVariants
/**
 * Данные выбранного компонента для обработки свойств.
 */
export interface ISelectedComponentData {
    id: string;
    component: {
        componentName: string;
        props: Record<string, unknown>;
        parent?: string | null;
        fullWidth?: boolean;
    };
    properties: PropertyDefinition[];
    description?: string;
}

/**
 * Возвращаемое значение composable usePropertyVariants.
 */
export interface IUsePropertyVariantsReturn {
    componentVariants: ComputedRef<ComponentVariantsMap>;
    handleNormalizeProps: (
        data: IComponentVariant,
        editorType: PropertyEditorType
    ) => Record<string, unknown>;
}
// #endregion

// #region useSlotDragDrop
/**
 * Состояние drag-and-drop для одного слота.
 */
export interface ISlotState {
    dragDepth: number;
    isDragOver: boolean;
    dropIndicator: { index: number; offset: number } | null;
    dropInsertIndex: number | null;
}

/**
 * Возвращаемое значение composable useSlotDragDrop.
 */
export interface IUseSlotDragDropReturn {
    slotIndicatorStyles: ComputedRef<Record<string, CSSProperties>>;
    getSlotIndicatorStyle: (slotName: string) => CSSProperties;
    setSlotContainerRef: (slotName: string) => VNodeRef;
    handleSlotDragEnter: (slotName: string, event: DragEvent) => void;
    handleSlotDragOver: (slotName: string, event: DragEvent) => void;
    handleSlotDragLeave: (slotName: string, event: DragEvent) => void;
    handleSlotDrop: (slotName: string, event: DragEvent) => void;
}
// #endregion
