// #region Imports
// Types
import type { ISelectedComponentData, IUsePropertyVariantsReturn } from '../types/composables';

// Vue
import { computed, type ComputedRef } from 'vue';

// Utils
import {
    formatDisplayValue,
    formatPrimitiveArrayValue,
    isPrimitiveArrayValue,
} from '../utils/propertyFormatters';

// Constants
import {
    PROPERTY_EDITOR_ORDER,
    type ComponentVariantsMap,
    type IComponentVariant,
    type PropertyVariantContext,
    type PropertyEditorType,
} from '../components/property-editors/types';
// #endregion

/**
 * Composable для управления вариантами свойств компонентов.
 * Преобразует определения свойств в варианты для различных типов редакторов.
 *
 * @param selectedComponentData - Computed значение с данными выбранного компонента
 * @returns Объект с вариантами свойств и функцией нормализации пропсов
 */
export function usePropertyVariants(
    selectedComponentData: ComputedRef<ISelectedComponentData | null>
): IUsePropertyVariantsReturn {
    // #region Computed
    /**
     * Вычисляемые варианты свойств для всех типов редакторов
     */
    const componentVariants = computed<ComponentVariantsMap>(() => {
        const selected = selectedComponentData.value;
        if (!selected) {
            return createEmptyVariants();
        }

        const variants = createEmptyVariants();

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
     * Создает пустую структуру вариантов для всех типов редакторов
     *
     * @returns Объект с пустыми массивами для каждого типа редактора
     */
    function createEmptyVariants(): ComponentVariantsMap {
        return PROPERTY_EDITOR_ORDER.reduce((acc, key) => {
            acc[key] = [];
            return acc;
        }, {} as ComponentVariantsMap);
    }

    /**
     * Добавляет вариант свойства в соответствующую коллекцию
     *
     * @param context - Контекст с информацией о свойстве и вариантах
     */
    function addVariantForProperty(context: PropertyVariantContext): void {
        if (!shouldRenderProperty(context.property, context.componentProps)) {
            return;
        }

        if (handleBooleanVariant(context)) {
            return;
        }
        if (handleSelectVariant(context)) {
            return;
        }
        if (handleSwitchVariant(context)) {
            return;
        }
        if (handleTextareaVariant(context)) {
            return;
        }
        if (handleInlineContentVariant(context)) {
            return;
        }
        if (handleTagsVariant(context)) {
            return;
        }
        if (handleImageGalleryVariant(context)) {
            return;
        }
        if (handleAccordionItemsVariant(context)) {
            return;
        }
        if (handleColorVariant(context)) {
            return;
        }
        if (handleImageVariant(context)) {
            return;
        }
        if (handleVideoVariant(context)) {
            return;
        }
        if (handleArrayVariant(context)) {
            return;
        }
        if (handleObjectVariant(context)) {
            return;
        }
        addInputVariant(context);
    }

    /**
     * Проверяет условие показа свойства в панели.
     */
    function shouldRenderProperty(
        property: PropertyVariantContext['property'],
        componentProps: Record<string, unknown>
    ): boolean {
        const showWhen = property.showWhen;
        if (!showWhen) {
            return true;
        }

        return componentProps[showWhen.field] === showWhen.equals;
    }

    /**
     * Обрабатывает select вариант свойства с опциями выбора
     *
     * @param context - Контекст с информацией о свойстве
     * @returns true, если вариант был обработан
     */
    function handleSelectVariant({
        property,
        componentProps,
        variants,
    }: PropertyVariantContext): boolean {
        if (!Array.isArray(property.options) || property.options.length < 2) {
            return false;
        }

        const options = property.options;

        variants.select.push({
            label: property.label || property.name,
            value: String(componentProps[property.name] ?? options[0]?.value ?? ''),
            specs: options.map((option) => ({
                label: String(option.label),
                value: String(option.value),
            })),
            facets: options.map((option) => String(option.value)),
            disabled: false,
            property,
        });

        return true;
    }

    /**
     * Обрабатывает switch вариант свойства (переключатель)
     *
     * @param context - Контекст с информацией о свойстве
     * @returns true, если вариант был обработан
     */
    function handleSwitchVariant({
        property,
        componentProps,
        variants,
    }: PropertyVariantContext): boolean {
        if (property.type !== 'switch') {
            return false;
        }

        variants.switch.push({
            label: property.label || property.name,
            value: Boolean(componentProps[property.name]),
            disabled: false,
            trueValue: true,
            falseValue: false,
            trueLabel: 'Вкл',
            falseLabel: '',
            size: 'small',
            property,
        });

        return true;
    }

    /**
     * Обрабатывает boolean вариант свойства (чекбокс)
     *
     * @param context - Контекст с информацией о свойстве
     * @returns true, если вариант был обработан
     */
    function handleBooleanVariant({
        property,
        componentProps,
        variants,
    }: PropertyVariantContext): boolean {
        if (property.type !== 'boolean') {
            return false;
        }

        variants.boolean.push({
            label: property.label || property.name,
            value: Boolean(componentProps[property.name]),
            disabled: false,
            property,
        });

        return true;
    }

    /**
     * Обрабатывает textarea вариант свойства (многострочный текст)
     *
     * @param context - Контекст с информацией о свойстве
     * @returns true, если вариант был обработан
     */
    function handleTextareaVariant({
        property,
        componentProps,
        variants,
    }: PropertyVariantContext): boolean {
        if (property.type !== 'textarea') {
            return false;
        }

        variants.textarea.push({
            label: property.label || property.name,
            value: formatDisplayValue(componentProps[property.name]),
            disabled: false,
            placeholder: `Enter ${property.label || property.name}`,
            property,
        });

        return true;
    }

    /**
     * Обрабатывает вариант сложного редактора для inline-контента.
     *
     * @param context - Контекст с информацией о свойстве
     * @returns true, если вариант был обработан
     */
    function handleInlineContentVariant({
        property,
        componentProps,
        variants,
    }: PropertyVariantContext): boolean {
        if (property.type !== 'inline-content') {
            return false;
        }

        const currentValue = componentProps[property.name];
        const fallback =
            Array.isArray(property.default) && property.default.length > 0 ? property.default : [];
        const value = Array.isArray(currentValue) ? currentValue : fallback;

        variants['inline-content'].push({
            label: property.label || property.name,
            value,
            disabled: false,
            property,
        });

        return true;
    }

    /**
     * Обрабатывает вариант редактора галереи изображений.
     *
     * @param context - Контекст с информацией о свойстве
     * @returns true, если вариант был обработан
     */
    function handleImageGalleryVariant({
        property,
        componentProps,
        variants,
    }: PropertyVariantContext): boolean {
        if (property.type !== 'image-gallery') {
            return false;
        }

        const currentValue = componentProps[property.name];
        const fallback =
            Array.isArray(property.default) && property.default.length > 0 ? property.default : [];
        const value = Array.isArray(currentValue) ? currentValue : fallback;

        variants['image-gallery'].push({
            label: property.label || property.name,
            value,
            disabled: false,
            property,
        });

        return true;
    }

    /**
     * Обрабатывает вариант редактора элементов аккордеона.
     *
     * @param context - Контекст с информацией о свойстве
     * @returns true, если вариант был обработан
     */
    function handleAccordionItemsVariant({
        property,
        componentProps,
        variants,
    }: PropertyVariantContext): boolean {
        if (property.type !== 'accordion-items') {
            return false;
        }

        const currentValue = componentProps[property.name];
        const fallback =
            Array.isArray(property.default) && property.default.length > 0 ? property.default : [];
        const value = Array.isArray(currentValue) ? currentValue : fallback;

        variants['accordion-items'].push({
            label: property.label || property.name,
            value,
            disabled: false,
            property,
        });

        return true;
    }

    /**
     * Обрабатывает color вариант свойства (hex color picker)
     *
     * @param context - Контекст с информацией о свойстве
     * @returns true, если вариант был обработан
     */
    function handleColorVariant({
        property,
        componentProps,
        variants,
    }: PropertyVariantContext): boolean {
        if (property.type !== 'color') {
            return false;
        }

        variants.color.push({
            label: property.label || property.name,
            value: formatDisplayValue(componentProps[property.name]),
            disabled: false,
            property,
        });

        return true;
    }

    /**
     * Обрабатывает tags вариант свойства (массив строк с chips-редактором).
     */
    function handleTagsVariant({
        property,
        componentProps,
        variants,
    }: PropertyVariantContext): boolean {
        if (property.type !== 'tags') {
            return false;
        }

        const currentValue = componentProps[property.name];
        const fallback = Array.isArray(property.default) ? property.default : [];
        const source = Array.isArray(currentValue) ? currentValue : fallback;
        const value = source.map((item) => String(item).trim()).filter((item) => Boolean(item));

        variants.tags.push({
            label: property.label || property.name,
            value,
            disabled: false,
            property,
        });

        return true;
    }

    /**
     * Обрабатывает image вариант свойства (выбор изображения)
     *
     * @param context - Контекст с информацией о свойстве
     * @returns true, если вариант был обработан
     */
    function handleImageVariant({
        property,
        componentProps,
        variants,
    }: PropertyVariantContext): boolean {
        if (property.type !== 'image') {
            return false;
        }

        variants.image.push({
            label: property.label || property.name,
            value: formatDisplayValue(componentProps[property.name]),
            disabled: false,
            property,
        });

        return true;
    }

    /**
     * Обрабатывает video вариант свойства (выбор видео)
     *
     * @param context - Контекст с информацией о свойстве
     * @returns true, если вариант был обработан
     */
    function handleVideoVariant({
        property,
        componentProps,
        variants,
    }: PropertyVariantContext): boolean {
        if (property.type !== 'video') {
            return false;
        }

        variants.video.push({
            label: property.label || property.name,
            value: formatDisplayValue(componentProps[property.name]),
            disabled: false,
            property,
        });

        return true;
    }

    /**
     * Обрабатывает array вариант свойства (массив значений)
     *
     * @param context - Контекст с информацией о свойстве
     * @returns true, если вариант был обработан
     */
    function handleArrayVariant({
        property,
        componentProps,
        variants,
    }: PropertyVariantContext): boolean {
        if (property.type !== 'array') {
            return false;
        }

        const currentValue = componentProps[property.name];
        const primitiveSource =
            (Array.isArray(currentValue) && isPrimitiveArrayValue(currentValue)
                ? currentValue
                : null) ||
            (Array.isArray(property.default) && isPrimitiveArrayValue(property.default)
                ? property.default
                : null);

        if (primitiveSource) {
            variants.input.push({
                label: property.label || property.name,
                value: formatPrimitiveArrayValue(
                    Array.isArray(currentValue) ? currentValue : primitiveSource
                ),
                disabled: false,
                placeholder: 'item1, item2, item3',
                property,
            });
            return true;
        }

        variants.json.push({
            label: property.label || property.name,
            value: currentValue ?? property.default ?? [],
            disabled: false,
            property,
        });

        return true;
    }

    /**
     * Обрабатывает object вариант свойства (объект)
     *
     * @param context - Контекст с информацией о свойстве
     * @returns true, если вариант был обработан
     */
    function handleObjectVariant({
        property,
        componentProps,
        variants,
    }: PropertyVariantContext): boolean {
        if (property.type !== 'object') {
            return false;
        }

        variants.json.push({
            label: property.label || property.name,
            value: componentProps[property.name] ?? property.default ?? {},
            disabled: false,
            property,
        });

        return true;
    }

    /**
     * Добавляет input вариант свойства (текстовое поле по умолчанию)
     *
     * @param context - Контекст с информацией о свойстве
     */
    function addInputVariant({ property, componentProps, variants }: PropertyVariantContext): void {
        variants.input.push({
            label: property.label || property.name,
            value: formatDisplayValue(componentProps[property.name]),
            disabled: false,
            property,
        });
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
        _editorType: PropertyEditorType
    ): Record<string, unknown> {
        if (data.specs) {
            return {
                label: data.label,
                value: String(data.value),
                specs: data.specs,
                facets: data.facets,
            };
        }

        if (data.trueValue !== undefined || data.falseValue !== undefined) {
            return {
                label: data.label,
                value: data.value,
                trueValue: data.trueValue,
                trueLabel: data.trueLabel,
                falseValue: data.falseValue,
                falseLabel: data.falseLabel,
                size: data.size ?? 'small',
            };
        }

        const base: Record<string, unknown> = {
            label: data.label,
            value: data.value,
            disabled: data.disabled,
            placeholder: data.placeholder,
        };

        if (data.property?.min !== undefined) {
            base.min = data.property.min;
        }

        if (data.property?.max !== undefined) {
            base.max = data.property.max;
        }

        if (data.property?.step !== undefined) {
            base.step = data.property.step;
        }

        if (data.property?.unit) {
            base.unit = data.property.unit;
        }

        return base;
    }
    // #endregion

    return {
        componentVariants,
        handleNormalizeProps,
    };
}
