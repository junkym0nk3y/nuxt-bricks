/**
 * Sidebar component types
 */

import type {
    IBricksSchema,
    IDragVisualSize,
    IComponentLibraryItem,
} from '../../../../common/types/brick';
import type { TMediaGalleryContext } from '../../../../common/types/media';
import type { Component, ComputedRef, Ref, ShallowRef } from 'vue';

export interface ISidebarComponentCardProps {
    component: IComponentLibraryItem;
    isLayout?: boolean;
}

/**
 * Пропсы корня сайдбара. `isLibraryLoadFailed` идёт отдельно от состава
 * `components`: layout-блоки остаются в списке и при отказе ручки манифеста,
 * поэтому по длине списка отказ неотличим от успешной загрузки без бриков.
 */
export interface ISidebarProps {
    components: IComponentLibraryItem[];
    isLibraryLoadFailed: boolean;
    isLibraryLoading: boolean;
}

export interface ISidebarEmits {
    openMediaGallery: [context: TMediaGalleryContext];
    importSchema: [schema: IBricksSchema];
    retryLibrary: [];
}

export interface ISidebarComponentsViewProps {
    components: IComponentLibraryItem[];
    isLibraryLoadFailed: boolean;
    isLibraryLoading: boolean;
}

export interface ISidebarComponentsViewEmits {
    close: [];
    retry: [];
}

export interface IDragComposable {
    startDrag: (
        component: IComponentLibraryItem,
        event: DragEvent,
        previewSize: IDragVisualSize
    ) => void;
    endDrag: () => void;
}

export interface IComponentCardPreview {
    ComponentPreview: ShallowRef<Component | null>;
    previewWrapperRef: Ref<HTMLElement | null>;
    previewContentRef: Ref<HTMLElement | null>;
    componentWrapperRef: Ref<HTMLElement | null>;
    measureWrapperRef: Ref<HTMLElement | null>;
    previewScale: Ref<number>;
    componentProps: ComputedRef<Record<string, unknown>>;
    measureComponent: ComputedRef<Component | null>;
    measureBindProps: ComputedRef<Record<string, unknown>>;
    getDragPreviewSize: () => IDragVisualSize;
}
