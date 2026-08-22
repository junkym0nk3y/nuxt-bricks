import type { Component } from 'vue';
import type {
    IPropertyDefinition,
    IDeviceVisibilityConfig,
    TBricksDeviceKey,
    TBrickPropValue,
} from '../../../../common/types/brick';
import type {
    TComponentVariantsMap,
    IComponentVariant,
    IGridSizeVariants,
    TPropertyEditorType,
    TSpacingSlot,
} from '../components/property-editors/types';

export type TInlineGalleryPayload = {
    action: 'append' | 'replace';
    segmentIndex?: number;
    insertIndex?: number;
    itemIndex?: number;
};

export type TMediaContext =
    | {
          kind: 'property';
          property: IPropertyDefinition;
      }
    | ({
          kind: 'image-gallery';
          property: IPropertyDefinition;
      } & TInlineGalleryPayload);

export interface IUseSidebarPropertiesPanelOptions {
    onOpenMediaGallery: () => void;
}

export interface IUseSidebarMediaSelectionOptions {
    /** Opens the media gallery modal (UI outside this domain) */
    onOpenMediaGallery: () => void;
}

/** Shared property handlers passed down into the editors of the panel */
export interface ISidebarPropertyHandlers {
    handleNormalizeProps: (
        data: IComponentVariant,
        editorType: TPropertyEditorType
    ) => Record<string, unknown>;
    handleChangeValues: (property: IPropertyDefinition, value: TBrickPropValue) => void;
    handleOpenMediaGallery: (
        property: IPropertyDefinition,
        payload?: TInlineGalleryPayload
    ) => void;
}

export interface ISidebarPropertyEditorsProps extends ISidebarPropertyHandlers {
    componentEditors: Record<TPropertyEditorType, Component>;
    componentVariants: TComponentVariantsMap;
    orderedPropertyNames?: string[];
    fullWidthValue: boolean;
    showFullWidthControl: boolean;
    isHiddenValue: boolean;
    deviceVisibilityValue: IDeviceVisibilityConfig;
    handleToggleFullWidth: (value: boolean) => void;
    handleToggleHidden: (value: boolean) => void;
    handleToggleDeviceVisibility: (device: TBricksDeviceKey, value: boolean) => void;
    htmlIdValue: string;
    handleSetHtmlId: (htmlId: string) => void;
    propertyOrder?: readonly TPropertyEditorType[];
}

export interface ISidebarPropertyEditorRowProps extends ISidebarPropertyHandlers {
    type: TPropertyEditorType;
    variant: IComponentVariant;
    componentEditors: Record<TPropertyEditorType, Component>;
    showGroupLabel?: boolean;
}

export interface ISidebarPropertySpacingEditorProps {
    /**
     * Variants of the spacing properties of the group (paddingTop, paddingBottom,
     * paddingX, paddingY, marginTop, marginBottom)
     */
    items: IComponentVariant[];
    handleChangeValues: (property: IPropertyDefinition, value: TBrickPropValue) => void;
}

export interface ISidebarPropertyGridSizeEditorProps extends IGridSizeVariants {
    handleChangeValues: (property: IPropertyDefinition, value: TBrickPropValue) => void;
}

export interface ISidebarPropertySpacingEditorSideProps {
    /** Slot of a box-model side: a stepper, or a read-only mirror of the paired side */
    item: TSpacingSlot;
    /** Whether the inline input of this side is active */
    isEditing?: boolean;
    /** Current text of the inline input (v-model:editing-value) */
    editingValue?: string;
    /** Vertical layout of the stepper (the left side of the box model) */
    vertical?: boolean;
}
