/**
 * Types for the composables of the sidebar domain.
 */

import type {
    TComponentVariantsMap,
    IComponentVariant,
    TPropertyEditorType,
    ISpacingStepperSlot,
    TSpacingSlot,
    TSpacingSideKey,
} from '../components/property-editors/types';
import type { ComputedRef, Ref } from 'vue';
import type { IBricksComponent, IBricksSchema } from '../../../../common/types/brick';
import type { TComponentMoveDestination } from '../../../core/types/componentMove';
import type { TPublishFormState } from '../../../../common/types/bricks-api';
import type { IMediaItem } from '../../../../common/types/media';
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
    handleNormalizeProps: (
        data: IComponentVariant,
        editorType: TPropertyEditorType
    ) => Record<string, unknown>;
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

// #region useSidebarPublishForm
/**
 * Initial values of the vee-validate publish form (the validated fields).
 */
export interface IPublishFormInitialValues {
    pagename: string;
    title: string;
    description: string;
    keywords: string;
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
 * Request of a move, resolved by the row and performed by the tree controller.
 * The row knows the neighbors and the destination, the controller owns the store
 * call and the answer to the user.
 */
export interface ISchemaTreeMoveRequest {
    sourceId: string;
    destination: TComponentMoveDestination;
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
