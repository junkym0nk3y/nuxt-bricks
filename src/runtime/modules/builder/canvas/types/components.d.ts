/**
 * Canvas component types
 */

import type { Component, CSSProperties, Ref } from 'vue';
import type {
    IComponentLibraryItem,
    IBricksComponent,
    IDeviceVisibilityConfig,
    TBricksDeviceKey,
} from '../../../common/types/brick';
import type { TLayoutProps } from '../../../layouts-blocks/types/blockProps';
import type { TBricksComponentsStore } from '../../core/stores/components';

export interface ICanvasItemProps {
    component: IBricksComponent;
}

export interface ICanvasItemLayoutProps {
    /** Component instance to render */
    component: IBricksComponent;
    /** Lower-cased name of the block, as the registry knows it (grid, flex, section, …) */
    layoutName: string;
    /** Props specific to the layout component */
    layoutProps: TLayoutProps;
    /** Resolved props to pass into the component (internal ones excluded) */
    componentBoundProps: Record<string, unknown>;
    /** Whether the component has to be wrapped in a container */
    needsContainerWrapper: boolean;
    /** Child components for layout containers */
    childComponents: IBricksComponent[];
}

export interface ICanvasItemComponentProps {
    component: IBricksComponent;
    componentInstance: Component | null;
    componentBoundProps: Record<string, unknown>;
    needsContainerWrapper: boolean;
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
    /** Active state of a toggle item (the indicator dot on its right) */
    active?: boolean;
    /** Whether a click on the item closes the menu */
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
        store: TBricksComponentsStore,
        options?: { rootTargetIndex?: number | null }
    ) => void;
    handleDragOver: (event: DragEvent) => void;
    draggedComponent: Ref<IComponentLibraryItem | null>;
    endDrag: () => void;
}

export interface ICanvasBottomBarProps {
    scale: number;
    viewport: TBricksDeviceKey;
    sidebarOffset?: string;
    rightSidebarOffset?: string;
    isFigmaMode?: boolean;
}

export interface ICanvasViewportProps {
    viewport: TBricksDeviceKey;
}

export interface ICanvasConditionalContainerProps {
    /** Whether the content has to be wrapped in div.bricks-container */
    useContainer: boolean;
}

export interface ICanvasDropPlaceholderProps {
    /** The insertion point sits at the canvas root and lands inside `.bricks-container` */
    contained?: boolean;
}

export interface ICanvasBottomBarEmits {
    'update:viewport': [viewport: TBricksDeviceKey];
    zoomIn: [];
    zoomOut: [];
    zoomReset: [];
    toggleFigmaMode: [];
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
