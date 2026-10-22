/**
 * Types for the composables of the sidebar domain.
 */

import type {
    TComponentVariantsMap,
    ISpacingStepperSlot,
    TPropertyEditorType,
    TSpacingSlot,
    TSpacingSideKey,
} from '../components/property-editors/types';
import type { Component, ComputedRef, Ref } from 'vue';
import type {
    IBricksComponent,
    IBricksSchema,
    IDeviceVisibilityConfig,
    IPropertyDefinition,
    TBricksDeviceKey,
    TBrickPropValue,
} from '../../../../common/types/brick';
import type { TComponentMoveDestination } from '../../../core/types/componentMove';
import type { TPublishFormState } from '../../../../common/types/bricks-api';
import type { IMediaItem } from '../../../../common/types/media';
import type { TMediaContext, TInlineGalleryPayload } from './sidebarProperties';
import type { ISelectedComponentData } from '../../../core/stores/types';
import type { TBrickDemoValues } from '../../../../common/types/index';
import type { IBrickUiCommonProp } from '../../../../ui/types/common';
import type { createPublishValidationSchema } from '../../../publish/utils/validationSchema';

// #region usePropertyVariants
/**
 * Data of the selected component — the one definition lives in the core.
 */
export type { ISelectedComponentData } from '../../../core/stores/types';

/**
 * Return value of the `usePropertyVariants` composable.
 */
export interface IUsePropertyVariantsReturn {
    componentVariants: ComputedRef<TComponentVariantsMap>;
}

/**
 * Options of the `usePropertyVariants` composable.
 */
export interface IUsePropertyVariantsOptions {
    /**
     * Whether the editor of a property has to be shown but not editable. The panel
     * answers it by the device scope: a property no render adapts is not editable on a
     * device tab, and a disabled field says so better than a control that accepts a
     * change and drops it.
     */
    isPropertyLocked?: (property: IPropertyDefinition) => boolean;
}
// #endregion

// #region useSpacingEditor
/**
 * Return value of the `useSpacingEditor` composable (box-model editor of a spacing group).
 */
export interface IUseSpacingEditorReturn {
    /** Side whose inline input is active (null — no input is active) */
    editingSide: Ref<TSpacingSideKey | null>;
    /** Current text of the inline input */
    editingValue: Ref<string>;
    /** The group consists of margin properties only (the steppers stand outside the "block") */
    isMargin: ComputedRef<boolean>;
    /** Caption of the central block (Content/Block) */
    contentLabel: ComputedRef<string>;
    topSlot: ComputedRef<ISpacingStepperSlot | null>;
    bottomSlot: ComputedRef<TSpacingSlot | null>;
    leftSlot: ComputedRef<ISpacingStepperSlot | null>;
    rightSlot: ComputedRef<TSpacingSlot | null>;
    handleStep: (slot: TSpacingSlot, direction: 1 | -1) => void;
    startEdit: (slot: TSpacingSlot) => void;
    commitEdit: (slot: TSpacingSlot) => void;
    cancelEdit: () => void;
}
// #endregion

// #region usePublishValidationSchema
/**
 * Return value of the `usePublishValidationSchema` composable.
 */
export interface IUsePublishValidationSchemaReturn {
    validationSchema: ReturnType<typeof createPublishValidationSchema>;
}
// #endregion

// #region useSidebarMediaSelection
/**
 * Options of the `useSidebarMediaSelection` composable.
 */
export interface IUseSidebarMediaSelectionOptions {
    /** Opens the media gallery modal (UI outside this domain) */
    onOpenMediaGallery: () => void;
    /**
     * Writes a picked value the ordinary way — through the device scope of the panel.
     * Used for a media property the blocks DO adapt (the background of a Section, a
     * gallery of a brick component): its value belongs to the active device, while the
     * identity write of a file deals with the base props alone.
     */
    onWriteScopedValue: (property: IPropertyDefinition, value: TBrickPropValue) => void;
    /**
     * The current value of a property AS THE PANEL SHOWS IT — the base props with the
     * overrides of the active device merged in. A gallery is edited by rewriting the
     * whole array, so building the new one out of the base value would drop whatever
     * the device had of its own.
     */
    readScopedValue: (property: IPropertyDefinition) => unknown;
    /**
     * Whether a property accepts a change at the scope the panel is showing. Asked
     * before the gallery even opens: the pick of a gallery image writes the base props
     * directly, so the guard of the change handler would never see it.
     */
    isPropertyWritable: (property: IPropertyDefinition) => boolean;
}

/**
 * Return value of the `useSidebarMediaSelection` composable.
 */
export interface IUseSidebarMediaSelectionReturn {
    /** What the open gallery is picking for; null while it is closed */
    currentMediaContext: Ref<TMediaContext | null>;
    handleOpenMediaGallery: (
        property: IPropertyDefinition,
        inlinePayload?: TInlineGalleryPayload
    ) => void;
    handleMediaSelect: (item: IMediaItem) => void;
}
// #endregion

// #region useSidebarResponsiveScope
/**
 * Return value of the `useSidebarResponsiveScope` composable.
 */
export interface IUseSidebarResponsiveScopeReturn {
    /** The selected component is a layout block responsive as a whole */
    isResponsiveLayout: ComputedRef<boolean>;
    /** The selected component carries brick properties marked `responsive` */
    hasResponsiveBrickValues: ComputedRef<boolean>;
    isResponsiveComponent: ComputedRef<boolean>;
    /** Device the overrides are being edited under */
    layoutDeviceScope: Ref<TBricksDeviceKey>;
    hasResponsiveOverridesForScope: ComputedRef<boolean>;
    /**
     * Whether the active device scope holds properties that cannot be edited on it.
     * The panel shows one line of explanation instead of leaving the disabled fields
     * unexplained.
     */
    hasLockedPropertiesForScope: ComputedRef<boolean>;
    /** The selection with the overrides of the scope merged into its props */
    selectedComponentDataForVariants: ComputedRef<ISelectedComponentData | null>;
    handleSetLayoutDeviceScope: (scope: TBricksDeviceKey) => void;
    handleResetLayoutDeviceScopeOverrides: () => void;
}
// #endregion

// #region useSidebarPropertiesPanel
/**
 * Options of the `useSidebarPropertiesPanel` composable.
 */
export interface IUseSidebarPropertiesPanelOptions {
    onOpenMediaGallery: () => void;
}

/**
 * Return value of the `useSidebarPropertiesPanel` composable (the facade of the
 * properties panel).
 *
 * The store itself is deliberately absent from the contract: the panel gets the two
 * things it read out of it — the id of the selection and the deletion — and the rest
 * of the store stops travelling through the facade, where every new action of the
 * store would silently widen this contract.
 */
export interface IUseSidebarPropertiesPanelReturn {
    componentEditors: Record<TPropertyEditorType, Component>;
    componentVariants: ComputedRef<TComponentVariantsMap>;
    /** Id of the selected component; an empty string when there is no selection */
    selectedComponentId: ComputedRef<string>;
    selectedComponentName: ComputedRef<string>;
    selectedComponentDescription: ComputedRef<string>;
    orderedPropertyNames: ComputedRef<string[]>;
    hasPropertiesSection: ComputedRef<boolean>;
    showFullWidthControl: ComputedRef<boolean>;
    fullWidthValue: ComputedRef<boolean>;
    isHiddenValue: ComputedRef<boolean>;
    deviceVisibilityValue: ComputedRef<IDeviceVisibilityConfig>;
    isResponsiveLayout: ComputedRef<boolean>;
    isResponsiveComponent: ComputedRef<boolean>;
    layoutDeviceScope: Ref<TBricksDeviceKey>;
    hasResponsiveOverridesForScope: ComputedRef<boolean>;
    /** Whether the active device scope holds properties that cannot be edited on it */
    hasLockedPropertiesForScope: ComputedRef<boolean>;
    htmlIdValue: ComputedRef<string>;
    handleChangeValues: (property: IPropertyDefinition, value: TBrickPropValue) => void;
    handleToggleFullWidth: (value: boolean) => void;
    handleToggleHidden: (value: boolean) => void;
    handleToggleDeviceVisibility: (device: TBricksDeviceKey, value: boolean) => void;
    handleSetHtmlId: (htmlId: string) => void;
    handleOpenMediaGallery: (
        property: IPropertyDefinition,
        inlinePayload?: TInlineGalleryPayload
    ) => void;
    handleMediaSelect: (item: IMediaItem) => void;
    handleSetLayoutDeviceScope: (scope: TBricksDeviceKey) => void;
    handleResetLayoutDeviceScopeOverrides: () => void;
    handleDeleteSelectedComponent: () => void;
}
// #endregion

// #region useSidebarPublishForm
/**
 * Initial values of the vee-validate publish form (the validated fields).
 */
export interface IPublishFormInitialValues {
    pagename: string;
    title: string;
    description: string;
    keywords: string;
    /**
     * The routing fields travel into the form together with the validated ones: yup
     * checks the page address as the `urlPrefix` plus `pagename` pair, and without the
     * prefix in the form it would see an empty one and let a taken address through.
     */
    urlPrefix: string;
    subdomain: string;
    /** The page code is validated by length, so it travels into the form as well */
    headCode: string;
    bodyEndCode: string;
}

/**
 * Return value of the `useSidebarPublishForm` composable (the publish form of the sidebar).
 */
export interface IUseSidebarPublishFormReturn {
    /** Current state of the form, taken from the publish store */
    settings: ComputedRef<TPublishFormState>;
    isSubmitting: ComputedRef<boolean>;
    defaultBackgroundColor: ComputedRef<string>;
    defaultLayout: ComputedRef<string>;
    initialValues: ComputedRef<IPublishFormInitialValues>;
    /**
     * Key of the form — changes on a change of `editingPageId` only, otherwise the
     * form loses focus
     */
    formKey: ComputedRef<string>;
    layoutOptions: ComputedRef<IBrickUiCommonProp[]>;
    layoutFacets: ComputedRef<TBrickDemoValues[]>;
    panelTitle: ComputedRef<string>;
    /** Preview of the full page URL (subdomain + prefix + pagename) */
    fullUrlPreview: ComputedRef<string>;
    validationSchema: ReturnType<typeof createPublishValidationSchema>;
    handleUpdateField: <K extends keyof TPublishFormState>(
        field: K,
        value: TPublishFormState[K]
    ) => void;
    handleMediaSelect: (item: IMediaItem) => void;
    handleClearSocialImage: () => void;
    handleLayoutChange: (value: TBrickDemoValues) => void;
}
// #endregion

// #region useEditableItemsList
/**
 * Options of the `useEditableItemsList` composable.
 */
export interface IUseEditableItemsListOptions<T extends object> {
    /** The list being edited, read-only: the composable never writes into it */
    items: ComputedRef<readonly T[]>;
    /** Receives the new list; the owner of the value decides what to do with it */
    onUpdate: (items: T[]) => void;
}

/**
 * Return value of the `useEditableItemsList` composable (operations of a list of
 * objects edited by a property editor).
 *
 * The type parameter is what keeps the contract readable rather than hiding it: `T`
 * ties the list, the callback and the type of an edited field into one declaration,
 * and the editor gets a checked `field`/`value` pair instead of a pair of strings.
 */
export interface IUseEditableItemsListReturn<T extends object> {
    updateItems: (items: T[]) => void;
    removeItem: (index: number) => void;
    /** -1 moves the item up the list, 1 moves it down */
    moveItem: (index: number, direction: -1 | 1) => void;
    updateField: <K extends keyof T>(index: number, field: K, value: T[K]) => void;
}
// #endregion

// #region useComponentCardDrag
/**
 * Return value of the `useComponentCardDrag` composable.
 */
export interface IComponentCardDrag {
    handleDragStart: (event: DragEvent) => void;
    handleDragEnd: () => void;
}
// #endregion

// #region useSidebarSchemaTreeDrop
/**
 * Where a dragged row is about to land relative to the row under the cursor:
 * next to it as a sibling, or inside it as a child.
 */
export type TSchemaTreeDropPosition = 'before' | 'inside' | 'after';

/**
 * Where a row of the tree can land a dragged block.
 *
 * A slot is excluded, and that is not an oversight: the tree is built out of
 * `children` alone, so a child of a slot has no row of its own and cannot be either
 * the source or the neighbor of a drop. Widening this to every move destination
 * would leave the controller with a branch the interface has no way to reach —
 * showing slot children in the tree is a product decision of its own, and it takes
 * the row building, this type and the store call together.
 */
export type TSchemaTreeMoveDestination = Exclude<TComponentMoveDestination, { kind: 'slot' }>;

/**
 * Request of a move, resolved by the row and performed by the tree controller.
 * The row knows the neighbors and the destination, the controller owns the store
 * call and the answer to the user.
 */
export interface ISchemaTreeMoveRequest {
    sourceId: string;
    destination: TSchemaTreeMoveDestination;
    targetIndex: number;
}

/**
 * Options of the `useSidebarSchemaTreeDrop` composable.
 */
export interface ISidebarSchemaTreeDropOptions {
    /** Row the drop is being resolved against. */
    component: Ref<IBricksComponent>;
    /** Reports the resolved move upward. */
    onMove: (request: ISchemaTreeMoveRequest) => void;
}

/**
 * Return value of the `useSidebarSchemaTreeDrop` composable.
 */
export interface ISidebarSchemaTreeDrop {
    /** Position the indicator is drawn for, or null when the drop is refused. */
    dropPosition: Ref<TSchemaTreeDropPosition | null>;
    handleDragStart: (event: DragEvent) => void;
    handleDragOver: (event: DragEvent) => void;
    handleDragLeave: (event: DragEvent) => void;
    handleDragEnd: () => void;
    handleDrop: (event: DragEvent) => void;
}
// #endregion
