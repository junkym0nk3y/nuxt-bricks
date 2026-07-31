/**
 * Типы для composables домена sidebar.
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
import type { IBricksSchema } from '../../../../common/types/brick';
import type { TPublishFormState } from '../../../../common/types/bricks-api';
import type { IMediaItem } from '../../../../common/types/media';
import type { TBrickDemoValues } from '../../../../common/types/index';
import type { IBrickUiCommonProp } from '../../../../ui/types/common';
import type { createPublishValidationSchema } from '../../../publish/utils/validationSchema';

// #region usePropertyVariants
/**
 * Данные выбранного компонента — единственное определение в core (см. modules-restructure.md).
 */
export type { ISelectedComponentData } from '../../../core/stores/types';

/**
 * Возвращаемое значение composable usePropertyVariants.
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
 * Возвращаемое значение composable useSpacingEditor (box-model редактор spacing-группы).
 */
export interface IUseSpacingEditorReturn {
    /** Сторона, в которой активен инлайн-ввод (null — ввод не активен). */
    editingSide: Ref<TSpacingSideKey | null>;
    /** Текущий текст инлайн-ввода. */
    editingValue: Ref<string>;
    /** Группа состоит только из margin-свойств (степперы снаружи «блока»). */
    isMargin: ComputedRef<boolean>;
    /** Подпись центрального блока (Content/Block). */
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
 * Начальные значения vee-validate формы публикации (валидируемые поля).
 */
export interface IPublishFormInitialValues {
    pagename: string;
    title: string;
    description: string;
}

/**
 * Возвращаемое значение composable useSidebarPublishForm (форма публикации сайдбара).
 */
export interface IUseSidebarPublishFormReturn {
    /** Текущее состояние формы из publish-стора. */
    settings: ComputedRef<TPublishFormState>;
    isSubmitting: ComputedRef<boolean>;
    defaultBackgroundColor: ComputedRef<string>;
    defaultLayout: ComputedRef<string>;
    initialValues: ComputedRef<IPublishFormInitialValues>;
    /** Ключ формы — меняется только при смене editingPageId (иначе форма теряет фокус). */
    formKey: ComputedRef<string>;
    layoutOptions: ComputedRef<IBrickUiCommonProp[]>;
    layoutFacets: ComputedRef<TBrickDemoValues[]>;
    panelTitle: ComputedRef<string>;
    /** Превью полного URL страницы (subdomain + prefix + pagename). */
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

// #region useSchemaFileTransfer
/**
 * Опции composable useSchemaFileTransfer (экспорт/импорт схемы JSON-файлом).
 */
export interface ISchemaFileTransferOptions {
    /** Вызывается с провалидированной схемой из выбранного файла. */
    onImport: (schema: IBricksSchema) => void;
}
// #endregion

// #region useComponentCardDrag
/**
 * Возвращаемое значение composable useComponentCardDrag.
 */
export interface IComponentCardDrag {
    handleDragStart: (event: DragEvent) => void;
    handleDragEnd: () => void;
}
// #endregion
