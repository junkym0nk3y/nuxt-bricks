/**
 * Types for the components of the sidebar domain.
 */

import type {
    IBricksComponent,
    IComponentLibraryItem,
    IDragVisualSize,
} from '../../../../common/types/brick';
import type { IMediaGalleryPickFilter, TMediaGalleryContext } from '../../../../common/types/media';
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
    /** The editor holds a template: the settings panel keeps the styling alone */
    isTemplate?: boolean;
}

export interface ISidebarEmits {
    openMediaGallery: [context: TMediaGalleryContext];
    retryLibrary: [];
    /** The publication switch of the publish settings; the write belongs to the page */
    togglePublished: [published: boolean];
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
    /** Carries which files the property can take: a picture, a video or a document */
    openMediaGallery: [pickFilter: IMediaGalleryPickFilter];
}

export interface ISidebarPropertiesPanelEmits {
    openMediaGallery: [pickFilter: IMediaGalleryPickFilter];
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

export interface ISidebarPublishViewProps {
    /**
     * The editor holds a template. A template carries the styling of a page — the
     * layout, the device set, the background and the navigation — and nothing of its
     * address, SEO text or publication: those are set when a page is created from it.
     */
    isTemplate?: boolean;
}

export interface ISidebarPublishViewEmits {
    close: [];
    openMediaGallery: [];
    togglePublished: [published: boolean];
}

export interface ISidebarPublishSocialImageProps {
    socialImage: string | null;
    isSubmitting: boolean;
}

export interface ISidebarPublishSocialImageEmits {
    openMediaGallery: [];
    clear: [];
}
