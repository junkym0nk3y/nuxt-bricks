/**
 * Canvas component types
 */

import type { CSSProperties, Ref } from 'vue';
import type { ComponentLibraryItem, LandingComponent } from '../../types/landing';
import type { ILandingInlineContentSegment } from '../../types/layouts';

export interface ILandingCanvasItemProps {
    component: LandingComponent;
}

export interface ILandingCanvasItemEmits {
    select: [id: string];
}

export interface ILayoutProperty {
    name: string;
    type:
        | 'number'
        | 'string'
        | 'select'
        | 'boolean'
        | 'textarea'
        | 'input'
        | 'image'
        | 'video'
        | 'inline-content'
        | 'array'
        | 'accordion-items'
        | 'color';
    label: string;
    default: string | number | boolean | ILandingInlineContentSegment[] | Record<string, unknown>[];
    options?: Array<{ label: string; value: string | number }>;
    description?: string;
    min?: number;
    max?: number;
    step?: number;
    /** Имя свойства, куда сохранять svgContent при выборе SVG из галереи */
    svgContentProperty?: string;
    /** Суффикс единицы измерения для инпута (например, 'rem') */
    unit?: string;
    /** Название группы для группировки свойств в сворачиваемый аккордеон */
    group?: string;
    /** Свойство поддерживает адаптивные значения per-breakpoint */
    responsive?: boolean;
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

export interface ILandingCanvasToolbarProps {
    scale: number;
    viewport: TViewportType;
    sidebarOffset?: string;
    isFigmaMode?: boolean;
}

export interface ILandingCanvasToolbarEmits {
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
