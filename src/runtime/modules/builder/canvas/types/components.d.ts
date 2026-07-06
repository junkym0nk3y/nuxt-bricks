/**
 * Canvas component types
 */

import type { CSSProperties, Ref } from 'vue';
import type {
    IComponentLibraryItem,
    IBricksComponent,
    TBricksDeviceKey,
} from '../../../common/types/brick';
import type { TBricksComponentsStore } from '../../core/stores/components';

export interface ICanvasItemProps {
    component: IBricksComponent;
}

export type TItemStyle = CSSProperties;

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
        store: TBricksComponentsStore,
        options?: { rootTargetIndex?: number | null }
    ) => void;
    handleDragOver: (event: DragEvent) => void;
    draggedComponent: Ref<IComponentLibraryItem | null>;
}

export interface ICanvasBottomBarProps {
    scale: number;
    viewport: TBricksDeviceKey;
    sidebarOffset?: string;
    rightSidebarOffset?: string;
    isFigmaMode?: boolean;
}

export interface ICanvasBottomBarEmits {
    'update:viewport': [viewport: TBricksDeviceKey];
    zoomIn: [];
    zoomOut: [];
    zoomReset: [];
    toggleFigmaMode: [];
}

export interface IViewportOption {
    value: TBricksDeviceKey;
    label: string;
    icon: string;
    width: number;
}

export interface IInlineEditingHeaderProps {
    propLabel: string;
    editablePropsCount: number;
    currentPropIndex: number;
    canSwitchPrev: boolean;
    canSwitchNext: boolean;
}

export interface IInlineEditingHeaderEmits {
    'switch-prev': [];
    'switch-next': [];
}
