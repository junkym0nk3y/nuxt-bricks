// #region Imports
// Types
import type { ISelectedComponentData, IUsePropertyVariantsReturn } from '../types/composables';
import type { IPropertyDefinition } from '../../../../common/types/brick';

// Vue
import { computed, type ComputedRef } from 'vue';
import { useI18n } from 'vue-i18n';

// Utils
import { readOwnKey } from '../../../../common/utils/safeRecord';
import { resolveBricksLabel } from '../../../../common/utils/i18nLabels';
import { normalizeVariantProps } from '../utils/normalizeVariantProps';
import {
    VARIANT_BUILDERS,
    buildInputVariant,
    buildSelectVariant,
    createEmptyVariants,
    type IVariantBuilderTools,
} from '../utils/variantBuilders';

// Constants
import {
    PROPERTY_EDITOR_ORDER,
    type TComponentVariantsMap,
    type IComponentVariant,
    type IPropertyVariantContext,
    type TPropertyEditorType,
} from '../components/property-editors/types';
// #endregion

/**
 * Composable для управления вариантами свойств компонентов.
 * Преобразует определения свойств в варианты для различных типов редакторов
 * через реестр билдеров `VARIANT_BUILDERS` (utils/variantBuilders.ts).
 *
 * @param selectedComponentData - Computed значение с данными выбранного компонента
 * @returns Объект с вариантами свойств и функцией нормализации пропсов
 */
export function usePropertyVariants(
    selectedComponentData: ComputedRef<ISelectedComponentData | null>
): IUsePropertyVariantsReturn {
    const { t, te } = useI18n();

    const builderTools: IVariantBuilderTools = {
        resolveLabel: (property) => resolveBricksLabel(t, te, property.label) || property.name,
        t,
    };

    // #region Computed
    /**
     * Вычисляемые варианты свойств для всех типов редакторов
     */
    const componentVariants = computed<TComponentVariantsMap>(() => {
        const selected = selectedComponentData.value;
        if (!selected) {
            return createEmptyVariants(PROPERTY_EDITOR_ORDER);
        }

        const variants = createEmptyVariants(PROPERTY_EDITOR_ORDER);

        selected.properties.forEach((property) => {
            if (property.type === 'readonly') {
                return;
            }
            try {
                addVariantForProperty({
                    property,
                    componentProps: selected.component.props,
                    variants,
                });
            } catch (error) {
                console.error('[usePropertyVariants] Error processing property:', property, error);
            }
        });

        return variants;
    });
    // #endregion

    // #region Methods
    /**
     * Добавляет вариант свойства в соответствующую коллекцию.
     * Порядок диспатча: boolean → select-эвристика (options 2+) →
     * реестр по типу → input-fallback.
     *
     * @param context - Контекст с информацией о свойстве и вариантах
     */
    function addVariantForProperty(context: IPropertyVariantContext): void {
        if (!shouldRenderProperty(context.property, context.componentProps)) {
            return;
        }

        const builder = VARIANT_BUILDERS[context.property.type];

        if (context.property.type === 'boolean' && builder) {
            builder(context, builderTools);
            return;
        }

        const resolveOptionLabel = (label: string): string =>
            resolveBricksLabel(t, te, label) ?? label;
        if (buildSelectVariant(context, builderTools, resolveOptionLabel)) {
            return;
        }

        if (builder) {
            builder(context, builderTools);
            return;
        }

        buildInputVariant(context, builderTools);
    }

    /**
     * Проверяет условие показа свойства в панели.
     *
     * Имя поля объявляет brick-файл: без сверки own-ключа `showWhen.field` вида
     * `constructor` вернул бы член прототипа, сравнение с `equals` было бы
     * ложным при любой схеме, и свойство молча исчезало бы из панели (BM-15).
     */
    function shouldRenderProperty(
        property: IPropertyDefinition,
        componentProps: Record<string, unknown>
    ): boolean {
        const showWhen = property.showWhen;
        if (!showWhen) {
            return true;
        }

        return readOwnKey(componentProps, showWhen.field) === showWhen.equals;
    }

    /**
     * Нормализует пропсы для передачи в компоненты редакторов
     *
     * @param data - Данные варианта свойства
     * @param editorType - Тип редактора свойства
     * @returns Нормализованный объект пропсов
     */
    function handleNormalizeProps(
        data: IComponentVariant,
        _editorType: TPropertyEditorType
    ): Record<string, unknown> {
        return normalizeVariantProps(data);
    }
    // #endregion

    return {
        componentVariants,
        handleNormalizeProps,
    };
}
