/**
 * Sidebar component types
 */

import type { IDragVisualSize, IComponentLibraryItem } from '../../../../common/types/brick';
import type { Component, ComputedRef, Ref, ShallowRef } from 'vue';

export interface ISidebarComponentCardProps {
    component: IComponentLibraryItem;
    isLayout?: boolean;
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
