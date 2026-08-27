/**
 * Types for the components of the sidebar domain.
 */

import type {
    IBricksComponent,
    IComponentLibraryItem,
    IDragVisualSize,
} from '../../../../common/types/brick';
import type { TMediaGalleryContext } from '../../../../common/types/media';
import type { ISkippedBrick } from '../../../core/types/componentLibrary';
import type { ISchemaTreeMoveRequest } from './composables';
import type { Component, ComputedRef, Ref, ShallowRef } from 'vue';

export interface ISidebarComponentCardProps {
    component: IComponentLibraryItem;
    isLayout?: boolean;
}

/**
 * Props of the sidebar root. `isLibraryLoadFailed` travels apart from the contents of
 * `components`: the layout blocks stay in the list even when the manifest endpoint
 * fails, so the length of the list tells nothing — a failure looks exactly like a
 * successful load with no bricks in it.
 */
export interface ISidebarProps {
    components: IComponentLibraryItem[];
    skippedBricks: ISkippedBrick[];
    isLibraryLoadFailed: boolean;
    isLibraryLoading: boolean;
}

export interface ISidebarEmits {
    openMediaGallery: [context: TMediaGalleryContext];
    retryLibrary: [];
}

export interface ISidebarComponentsViewProps {
    components: IComponentLibraryItem[];
    /**
     * Manifest entries that never reached the library. Shown next to the failure
     * block rather than instead of it: the causes differ, and both can be true at
     * once.
     */
    skippedBricks: ISkippedBrick[];
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
    componentWrapperRef: Ref<HTMLElement | null>;
    measureWrapperRef: Ref<HTMLElement | null>;
    previewScale: Ref<number>;
    componentProps: ComputedRef<Record<string, unknown>>;
    measureComponent: ComputedRef<Component | null>;
    measureBindProps: ComputedRef<Record<string, unknown>>;
    getDragPreviewSize: () => IDragVisualSize;
}

export interface ISidebarPropertiesViewEmits {
    close: [];
    openMediaGallery: [];
}

export interface ISidebarPropertiesPanelEmits {
    openMediaGallery: [];
}

export interface ISidebarSchemaTreeItemProps {
    component: IBricksComponent;
    depth?: number;
}

export interface ISidebarSchemaTreeItemEmits {
    select: [id: string];
    move: [request: ISchemaTreeMoveRequest];
}

export interface ISidebarSchemaTreeViewEmits {
    close: [];
}

export interface ISidebarPublishViewEmits {
    close: [];
    openMediaGallery: [];
}

export interface ISidebarPublishSocialImageProps {
    socialImage: string | null;
    isSubmitting: boolean;
}

export interface ISidebarPublishSocialImageEmits {
    openMediaGallery: [];
    clear: [];
}
