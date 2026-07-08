/**
 * Canvas component types
 */

import type { CSSProperties, Ref } from 'vue';
import type {
    IComponentLibraryItem,
    IBricksComponent,
    IDeviceVisibilityConfig,
    TBricksDeviceKey,
} from '../../../common/types/brick';
import type { TBricksComponentsStore } from '../../core/stores/components';

export interface ICanvasItemProps {
    component: IBricksComponent;
}

export type TItemStyle = CSSProperties;

export interface ICanvasContextMenuPosition {
    x: number;
    y: number;
}

export type TCanvasContextMenuAction =
    | 'edit'
    | 'copy'
    | 'paste'
    | 'duplicate'
    | 'delete'
    | 'move-up'
    | 'move-down'
    | 'toggle-favorite'
    | 'toggle-interactive-preview'
    | 'toggle-hidden';

export interface ICanvasContextMenuItem {
    id: TCanvasContextMenuAction;
    label: string;
    shortcut?: string;
    disabled?: boolean;
    /** Активное состояние toggle-пункта (точка-индикатор справа) */
    active?: boolean;
    /** Закрывать ли меню после клика по пункту */
    closesMenu?: boolean;
}

export interface ICanvasItemContextMenuProps {
    position: ICanvasContextMenuPosition;
    componentName: string;
    isHidden: boolean;
    isFavorite: boolean;
    deviceVisibility?: Partial<IDeviceVisibilityConfig>;
    canMoveUp: boolean;
    canMoveDown: boolean;
    isInteractivePreview?: boolean;
    canPaste?: boolean;
}

export interface ICanvasItemContextMenuEmits {
    edit: [];
    copy: [];
    paste: [];
    duplicate: [];
    delete: [];
    'toggle-hidden': [];
    'toggle-device': [device: TBricksDeviceKey];
    'move-up': [];
    'move-down': [];
    'toggle-favorite': [];
    'toggle-interactive-preview': [];
    close: [];
}

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
