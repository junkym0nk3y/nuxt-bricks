import type { Component } from 'vue';
import type { PropertyDefinition, IDeviceVisibilityConfig, TLandingDeviceKey } from '../../common/types/landing';
import type {
    ComponentVariantsMap,
    IComponentVariant,
    PropertyEditorType,
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
          property: PropertyDefinition;
      }
    | ({
          kind: 'inline-content';
          property: PropertyDefinition;
      } & TInlineGalleryPayload)
    | ({
          kind: 'image-gallery';
          property: PropertyDefinition;
      } & TInlineGalleryPayload);

export interface IUseSidebarPropertiesPanelOptions {
    onOpenMediaGallery: () => void;
}

export interface ISidebarPropertyEditorsProps {
    componentEditors: Record<PropertyEditorType, Component>;
    componentVariants: ComponentVariantsMap;
    orderedPropertyNames?: string[];
    fullWidthValue: boolean;
    showFullWidthControl: boolean;
    isHiddenValue: boolean;
    deviceVisibilityValue: IDeviceVisibilityConfig;
    handleNormalizeProps: (
        data: IComponentVariant,
        editorType: PropertyEditorType
    ) => Record<string, unknown>;
    handleChangeValues: (
        property: PropertyDefinition,
        value: string | boolean | number | Record<string, unknown> | Array<unknown>
    ) => void;
    handleOpenMediaGallery: (property: PropertyDefinition, payload?: TInlineGalleryPayload) => void;
    handleToggleFullWidth: (value: boolean) => void;
    handleToggleHidden: (value: boolean) => void;
    handleToggleDeviceVisibility: (device: TLandingDeviceKey, value: boolean) => void;
    htmlIdValue: string;
    handleSetHtmlId: (htmlId: string) => void;
    propertyOrder?: readonly PropertyEditorType[];
}

export interface ISidebarPropertyEditorRowProps {
    type: PropertyEditorType;
    variant: IComponentVariant;
    componentEditors: Record<PropertyEditorType, Component>;
    showGroupLabel?: boolean;
    handleNormalizeProps: (
        data: IComponentVariant,
        editorType: PropertyEditorType
    ) => Record<string, unknown>;
    handleChangeValues: (
        property: PropertyDefinition,
        value: string | boolean | number | Record<string, unknown> | Array<unknown>
    ) => void;
    handleOpenMediaGallery: (property: PropertyDefinition, payload?: TInlineGalleryPayload) => void;
}
