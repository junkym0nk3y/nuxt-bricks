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
    /** Открывает модалку медиагалереи (внешний UI). */
    onOpenMediaGallery: () => void;
}

/** Общие обработчики свойств, пробрасываемые в редакторы панели */
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
    /** Варианты spacing-свойств группы (paddingTop/paddingBottom/paddingX/paddingY/marginTop/marginBottom). */
    items: IComponentVariant[];
    handleChangeValues: (property: IPropertyDefinition, value: TBrickPropValue) => void;
}

export interface ISidebarPropertyGridSizeEditorProps extends IGridSizeVariants {
    handleChangeValues: (property: IPropertyDefinition, value: TBrickPropValue) => void;
}

export interface ISidebarPropertySpacingEditorSideProps {
    /** Слот стороны box-model: степпер или read-only зеркало парной стороны. */
    item: TSpacingSlot;
    /** Активен ли инлайн-ввод значения этой стороны. */
    isEditing?: boolean;
    /** Текущий текст инлайн-ввода (v-model:editing-value). */
    editingValue?: string;
    /** Вертикальная раскладка степпера (левая сторона box-model). */
    vertical?: boolean;
}
