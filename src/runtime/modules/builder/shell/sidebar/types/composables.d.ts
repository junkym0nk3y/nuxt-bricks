/**
 * Типы для composables домена sidebar.
 */

import type { PropertyDefinition } from '../../../../common/types/brick';
import type {
    ComponentVariantsMap,
    IComponentVariant,
    PropertyEditorType,
} from '../components/property-editors/types';
import type { ComputedRef } from 'vue';

// #region usePropertyVariants
/**
 * Данные выбранного компонента для обработки свойств.
 */
export interface ISelectedComponentData {
    id: string;
    component: {
        componentName: string;
        props: Record<string, unknown>;
        parent?: string | null;
        fullWidth?: boolean;
    };
    properties: PropertyDefinition[];
    description?: string;
}

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
