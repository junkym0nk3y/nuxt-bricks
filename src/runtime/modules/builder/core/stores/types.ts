import type {
    IBricksComponent,
    ISelectedComponent,
    IComponentSlotDefinition,
    IBricksSchema,
    IDeviceVisibilityConfig,
    TBricksDeviceKey,
    TBrickPropValue,
} from '../../../common/types/brick';
import type { TComponentMoveResult } from '../types/componentMove';

export interface IComponentClipboardSnapshot {
    rootId: string;
    parentId: string | null;
    slotName?: string;
    insertIndex: number | null;
    fullWidth?: boolean;
    tree: IBricksComponent[];
}

export interface IComponentsState {
    components: IBricksComponent[];
    selectedComponent: ISelectedComponent | null;
    clipboard: IComponentClipboardSnapshot | null;
    favorites: string[];
    /** Transient: id of the component in interactive preview (never exported to the schema) */
    interactivePreviewId: string | null;
}

export interface ISelectedComponentData {
    id: string;
    component: IBricksComponent;
    properties: ISelectedComponent['properties'];
    description?: ISelectedComponent['description'];
}

export type THistoryOptions = {
    skipHistory?: boolean;
};

export type TMoveComponentToLayoutOptions = {
    targetIndex?: number;
    gridColumn?: string;
    gridRow?: string;
    swap?: boolean;
};

export type TComponentInsertPayload = Omit<
    IBricksComponent,
    'id' | 'zIndex' | 'type' | 'children' | 'slotName' | 'slots'
> & {
    slots?: IComponentSlotDefinition[];
};

export interface IComponentsCrudActions {
    addComponent(
        this: IComponentsStore,
        component: TComponentInsertPayload,
        options?: THistoryOptions
    ): string;
    removeComponent(this: IComponentsStore, id: string, options?: THistoryOptions): void;
    detachComponentFromParent(
        this: IComponentsStore,
        childId: string,
        options?: THistoryOptions
    ): void;
    addChildToLayout(
        this: IComponentsStore,
        layoutId: string,
        childId: string,
        index?: number | null,
        options?: THistoryOptions
    ): TComponentMoveResult;
    removeChildFromLayout(
        this: IComponentsStore,
        layoutId: string,
        childId: string,
        options?: THistoryOptions
    ): void;
    moveComponentToLayout(
        this: IComponentsStore,
        layoutId: string,
        childId: string,
        options?: TMoveComponentToLayoutOptions
    ): TComponentMoveResult;
    moveComponentToRoot(
        this: IComponentsStore,
        childId: string,
        targetIndex?: number | null,
        options?: THistoryOptions
    ): void;
    getRootComponents(this: IComponentsStore): IBricksComponent[];
}

export interface IComponentsSlotActions {
    initializeComponentSlots(
        this: IComponentsStore,
        componentId: string,
        slots: IComponentSlotDefinition[]
    ): void;
    addComponentToSlot(
        this: IComponentsStore,
        parentId: string,
        slotName: string,
        childId: string,
        index?: number | null,
        options?: THistoryOptions
    ): TComponentMoveResult;
    removeComponentFromSlot(
        this: IComponentsStore,
        parentId: string,
        slotName: string,
        childId: string,
        options?: THistoryOptions
    ): void;
    moveComponentToSlot(
        this: IComponentsStore,
        parentId: string,
        slotName: string,
        childId: string,
        index?: number | null,
        options?: THistoryOptions
    ): TComponentMoveResult;
}

export interface IComponentsPropertyActions {
    updateComponentProp(
        this: IComponentsStore,
        id: string,
        propName: string,
        value: TBrickPropValue
    ): void;
    updateComponentIdentityProps(
        this: IComponentsStore,
        id: string,
        patch: Record<string, TBrickPropValue>
    ): void;
    updateComponentResponsiveProp(
        this: IComponentsStore,
        id: string,
        device: TBricksDeviceKey,
        propName: string,
        value: TBrickPropValue
    ): void;
    resetComponentResponsivePropsForDevice(
        this: IComponentsStore,
        id: string,
        device: TBricksDeviceKey
    ): void;
}

export interface IComponentsSelectionActions {
    selectComponent(
        this: IComponentsStore,
        id: string,
        properties?: ISelectedComponent['properties'],
        description?: ISelectedComponent['description']
    ): void;
    setSelectedComponentMetadata(
        this: IComponentsStore,
        id: string,
        properties: ISelectedComponent['properties'],
        description?: ISelectedComponent['description']
    ): void;
    deselectComponent(this: IComponentsStore): void;
    toggleInteractivePreview(this: IComponentsStore, id: string): void;
}

export interface IComponentsSchemaActions {
    setComponentFullWidth(this: IComponentsStore, id: string, fullWidth: boolean): void;
    setComponentHidden(this: IComponentsStore, id: string, hidden: boolean): void;
    setComponentHtmlId(this: IComponentsStore, id: string, htmlId: string): void;
    setComponentDeviceVisibility(
        this: IComponentsStore,
        id: string,
        visibility: Partial<IDeviceVisibilityConfig>
    ): void;
    setComponentDeviceVisibilityFlag(
        this: IComponentsStore,
        id: string,
        device: TBricksDeviceKey,
        value: boolean
    ): void;
    exportSchema(this: IComponentsStore): IBricksSchema;
    stripDeviceKeys(this: IComponentsStore, removedKeys: ReadonlySet<string>): void;
    saveToHistory(this: IComponentsStore): void;
    undo(this: IComponentsStore): void;
    redo(this: IComponentsStore): void;
    loadSchema(
        this: IComponentsStore,
        schema: IBricksSchema,
        options?: { resetHistory?: boolean }
    ): void;
}

export interface IComponentsClipboardActions {
    copyComponentToClipboard(this: IComponentsStore, id: string): void;
    copySelectedComponent(this: IComponentsStore): void;
    pasteFromClipboard(this: IComponentsStore): void;
    duplicateComponent(this: IComponentsStore, id: string): void;
}

export interface IComponentsOrderActions {
    moveComponentUp(this: IComponentsStore, id: string): void;
    moveComponentDown(this: IComponentsStore, id: string): void;
}

export interface IComponentsFavoritesActions {
    toggleFavorite(this: IComponentsStore, componentName: string): void;
}

export type TComponentsActions = IComponentsCrudActions &
    IComponentsSlotActions &
    IComponentsPropertyActions &
    IComponentsSelectionActions &
    IComponentsSchemaActions &
    IComponentsClipboardActions &
    IComponentsOrderActions &
    IComponentsFavoritesActions;

interface IComponentsComputed {
    getComponentById: (id: string) => IBricksComponent | undefined;
    selectedComponentData: ISelectedComponentData | null;
    sortedComponents: IBricksComponent[];
    isComponentSelected: (id: string) => boolean;
    isFavorite: (componentName: string) => boolean;
    hasComponents: boolean;
}

export interface IComponentsStore
    extends IComponentsState, IComponentsComputed, TComponentsActions {}
