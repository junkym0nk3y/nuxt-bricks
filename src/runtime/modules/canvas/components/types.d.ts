/**
 * Canvas component types
 */

import type { CSSProperties, Ref } from 'vue';
import type { ComponentLibraryItem, LandingComponent } from '../../common/types/landing';

export interface ICanvasItemProps {
    component: LandingComponent;
}

export interface ICanvasItemEmits {
    select: [id: string];
}

export type IItemStyle = CSSProperties;

export interface ILayoutDropDetail {
    layoutId: string;
    movedComponentId?: string | null;
    gridColumn?: string;
    gridRow?: string;
    targetIndex?: number | null;
    swap?: boolean;
}

export interface ISlotDropDetail {
    parentId: string;
    slotName: string;
    movedComponentId?: string | null;
    targetIndex?: number | null;
}

export interface IDragComposableCanvas {
    handleDrop: (
        event: DragEvent,
        element: HTMLElement,
        store: unknown,
        options?: { rootTargetIndex?: number | null }
    ) => void;
    handleDragOver: (event: DragEvent) => void;
    draggedComponent: Ref<ComponentLibraryItem | null>;
}

export type TViewportType = 'mobile' | 'tablet' | 'desktop';

export interface ICanvasToolbarProps {
    scale: number;
    viewport: TViewportType;
    sidebarOffset?: string;
    isFigmaMode?: boolean;
}

export interface ICanvasToolbarEmits {
    'update:scale': [scale: number];
    'update:viewport': [viewport: TViewportType];
    zoomIn: [];
    zoomOut: [];
    zoomReset: [];
    toggleFigmaMode: [];
}

export interface IViewportOption {
    value: TViewportType;
    label: string;
    icon: string;
    width: number;
}
