import type {
    LandingComponent,
    SelectedComponent,
    ComponentSlotDefinition,
    LandingSchema,
    IDeviceVisibilityConfig,
    TLandingDeviceKey,
} from '../../types/landing';

export interface IComponentClipboardSnapshot {
    rootId: string;
    parentId: string | null;
    slotName?: string;
    insertIndex: number | null;
    fullWidth?: boolean;
    tree: LandingComponent[];
    /** Свойства компонента для отображения в редакторе после вставки */
    properties?: SelectedComponent['properties'];
    /** Описание компонента */
    description?: SelectedComponent['description'];
}

export interface ILandingComponentsState {
    components: LandingComponent[];
    selectedComponent: SelectedComponent | null;
    clipboard: IComponentClipboardSnapshot | null;
    favorites: string[];
    /** Transient: id компонента в режиме интерактивного предпросмотра (не экспортируется в схему) */
    interactivePreviewId: string | null;
}

export interface ISelectedComponentData {
    id: string;
    component: LandingComponent;
    properties: SelectedComponent['properties'];
    description?: SelectedComponent['description'];
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
    LandingComponent,
    'id' | 'zIndex' | 'type' | 'children' | 'slotName' | 'slots'
> & {
    slots?: ComponentSlotDefinition[];
};

export interface ILandingComponentsCrudActions {
    addComponent(
        this: ILandingComponentsStore,
        component: TComponentInsertPayload,
        options?: THistoryOptions
    ): string;
    removeComponent(this: ILandingComponentsStore, id: string): void;
    detachComponentFromParent(
        this: ILandingComponentsStore,
        childId: string,
        options?: THistoryOptions
    ): void;
    addChildToLayout(
        this: ILandingComponentsStore,
        layoutId: string,
        childId: string,
        index?: number | null,
        options?: THistoryOptions
    ): void;
    removeChildFromLayout(
        this: ILandingComponentsStore,
        layoutId: string,
        childId: string,
        options?: THistoryOptions
    ): void;
    moveComponentToLayout(
        this: ILandingComponentsStore,
        layoutId: string,
        childId: string,
        options?: TMoveComponentToLayoutOptions
    ): void;
    moveComponentToRoot(
        this: ILandingComponentsStore,
        childId: string,
        targetIndex?: number | null,
        options?: THistoryOptions
    ): void;
    getRootComponents(this: ILandingComponentsStore): LandingComponent[];
}

export interface ILandingComponentsSlotActions {
    initializeComponentSlots(
        this: ILandingComponentsStore,
        componentId: string,
        slots: ComponentSlotDefinition[]
    ): void;
    addComponentToSlot(
        this: ILandingComponentsStore,
        parentId: string,
        slotName: string,
        childId: string,
        index?: number | null,
        options?: THistoryOptions
    ): void;
    removeComponentFromSlot(
        this: ILandingComponentsStore,
        parentId: string,
        slotName: string,
        childId: string,
        options?: THistoryOptions
    ): void;
    moveComponentToSlot(
        this: ILandingComponentsStore,
        parentId: string,
        slotName: string,
        childId: string,
        index?: number | null,
        options?: THistoryOptions
    ): void;
}

export interface ILandingComponentsPropertyActions {
    updateComponentProp(
        this: ILandingComponentsStore,
        id: string,
        propName: string,
        value: string | number | boolean | Record<string, unknown> | Array<unknown>
    ): void;
    updateComponentResponsiveProp(
        this: ILandingComponentsStore,
        id: string,
        device: TLandingDeviceKey,
        propName: string,
        value: string | number | boolean | Record<string, unknown> | Array<unknown>
    ): void;
    resetComponentResponsivePropsForDevice(
        this: ILandingComponentsStore,
        id: string,
        device: TLandingDeviceKey
    ): void;
}

export interface ILandingComponentsSelectionActions {
    selectComponent(
        this: ILandingComponentsStore,
        id: string,
        properties?: SelectedComponent['properties'],
        description?: SelectedComponent['description']
    ): void;
    deselectComponent(this: ILandingComponentsStore): void;
    toggleInteractivePreview(this: ILandingComponentsStore, id: string): void;
}

export interface ILandingComponentsSchemaActions {
    setComponentFullWidth(this: ILandingComponentsStore, id: string, fullWidth: boolean): void;
    setComponentHidden(this: ILandingComponentsStore, id: string, hidden: boolean): void;
    setComponentHtmlId(this: ILandingComponentsStore, id: string, htmlId: string): void;
    setComponentDeviceVisibility(
        this: ILandingComponentsStore,
        id: string,
        visibility: Partial<IDeviceVisibilityConfig>
    ): void;
    setComponentDeviceVisibilityFlag(
        this: ILandingComponentsStore,
        id: string,
        device: TLandingDeviceKey,
        value: boolean
    ): void;
    exportSchema(this: ILandingComponentsStore): LandingSchema;
    saveToHistory(this: ILandingComponentsStore): void;
    undo(this: ILandingComponentsStore): void;
    redo(this: ILandingComponentsStore): void;
    loadSchema(
        this: ILandingComponentsStore,
        schema: LandingSchema,
        options?: { resetHistory?: boolean }
    ): void;
}

export interface ILandingComponentsClipboardActions {
    copyComponentToClipboard(this: ILandingComponentsStore, id: string): void;
    copySelectedComponent(this: ILandingComponentsStore): void;
    pasteFromClipboard(this: ILandingComponentsStore): void;
    duplicateComponent(this: ILandingComponentsStore, id: string): void;
}

export interface ILandingComponentsOrderActions {
    moveComponentUp(this: ILandingComponentsStore, id: string): void;
    moveComponentDown(this: ILandingComponentsStore, id: string): void;
}

export interface ILandingComponentsFavoritesActions {
    toggleFavorite(this: ILandingComponentsStore, componentName: string): void;
}

export type ILandingComponentsActions = ILandingComponentsCrudActions &
    ILandingComponentsSlotActions &
    ILandingComponentsPropertyActions &
    ILandingComponentsSelectionActions &
    ILandingComponentsSchemaActions &
    ILandingComponentsClipboardActions &
    ILandingComponentsOrderActions &
    ILandingComponentsFavoritesActions;

export interface ILandingComponentsComputed {
    getComponentById: (id: string) => LandingComponent | undefined;
    selectedComponentData: ISelectedComponentData | null;
    sortedComponents: LandingComponent[];
    isComponentSelected: (id: string) => boolean;
    isFavorite: (componentName: string) => boolean;
    hasComponents: boolean;
}

export interface ILandingComponentsStore
    extends ILandingComponentsState, ILandingComponentsComputed, ILandingComponentsActions {}
