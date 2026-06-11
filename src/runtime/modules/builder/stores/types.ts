import type {
    LandingComponent,
    SelectedComponent,
    ComponentSlotDefinition,
    LandingSchema,
    IDeviceVisibilityConfig,
    TLandingDeviceKey,
} from '../../common/types/landing';

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

export interface IComponentsState {
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

export interface IComponentsCrudActions {
    addComponent(
        this: IComponentsStore,
        component: TComponentInsertPayload,
        options?: THistoryOptions
    ): string;
    removeComponent(this: IComponentsStore, id: string): void;
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
    ): void;
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
    ): void;
    moveComponentToRoot(
        this: IComponentsStore,
        childId: string,
        targetIndex?: number | null,
        options?: THistoryOptions
    ): void;
    getRootComponents(this: IComponentsStore): LandingComponent[];
}

export interface IComponentsSlotActions {
    initializeComponentSlots(
        this: IComponentsStore,
        componentId: string,
        slots: ComponentSlotDefinition[]
    ): void;
    addComponentToSlot(
        this: IComponentsStore,
        parentId: string,
        slotName: string,
        childId: string,
        index?: number | null,
        options?: THistoryOptions
    ): void;
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
    ): void;
}

export interface IComponentsPropertyActions {
    updateComponentProp(
        this: IComponentsStore,
        id: string,
        propName: string,
        value: string | number | boolean | Record<string, unknown> | Array<unknown>
    ): void;
    updateComponentResponsiveProp(
        this: IComponentsStore,
        id: string,
        device: TLandingDeviceKey,
        propName: string,
        value: string | number | boolean | Record<string, unknown> | Array<unknown>
    ): void;
    resetComponentResponsivePropsForDevice(
        this: IComponentsStore,
        id: string,
        device: TLandingDeviceKey
    ): void;
}

export interface IComponentsSelectionActions {
    selectComponent(
        this: IComponentsStore,
        id: string,
        properties?: SelectedComponent['properties'],
        description?: SelectedComponent['description']
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
        device: TLandingDeviceKey,
        value: boolean
    ): void;
    exportSchema(this: IComponentsStore): LandingSchema;
    saveToHistory(this: IComponentsStore): void;
    undo(this: IComponentsStore): void;
    redo(this: IComponentsStore): void;
    loadSchema(
        this: IComponentsStore,
        schema: LandingSchema,
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

export type IComponentsActions = IComponentsCrudActions &
    IComponentsSlotActions &
    IComponentsPropertyActions &
    IComponentsSelectionActions &
    IComponentsSchemaActions &
    IComponentsClipboardActions &
    IComponentsOrderActions &
    IComponentsFavoritesActions;

export interface IComponentsComputed {
    getComponentById: (id: string) => LandingComponent | undefined;
    selectedComponentData: ISelectedComponentData | null;
    sortedComponents: LandingComponent[];
    isComponentSelected: (id: string) => boolean;
    isFavorite: (componentName: string) => boolean;
    hasComponents: boolean;
}

export interface IComponentsStore
    extends IComponentsState, IComponentsComputed, IComponentsActions {}
