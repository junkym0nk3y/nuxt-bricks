/**
 * Типы для composables домена sidebar.
 */

import type {
    ComponentVariantsMap,
    IComponentVariant,
    PropertyEditorType,
} from '../components/property-editors/types';
import type { ComputedRef } from 'vue';
import type { BricksSchema } from '../../../../common/types/brick';

// #region usePropertyVariants
/**
 * Данные выбранного компонента — единственное определение в core (см. modules-restructure.md).
 */
export type { ISelectedComponentData } from '../../../core/stores/types';

/**
 * Возвращаемое значение composable usePropertyVariants.
 */
export interface IUsePropertyVariantsReturn {
    componentVariants: ComputedRef<ComponentVariantsMap>;
    handleNormalizeProps: (
        data: IComponentVariant,
        editorType: PropertyEditorType
    ) => Record<string, unknown>;
}
// #endregion

// #region useSchemaFileTransfer
/**
 * Опции composable useSchemaFileTransfer (экспорт/импорт схемы JSON-файлом).
 */
export interface ISchemaFileTransferOptions {
    /** Вызывается с провалидированной схемой из выбранного файла. */
    onImport: (schema: BricksSchema) => void;
}
// #endregion
