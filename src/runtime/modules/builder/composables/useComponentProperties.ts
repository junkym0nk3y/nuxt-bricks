import type { PropertyDefinition, PropertyType } from '../../common/types/brick';
import type { IBrickValues } from '../../common/types/index';
import { getModalOptions } from './useModals';

/**
 * Composable для работы со свойствами компонентов.
 */
export function useComponentProperties() {
    /**
     * Определяет тип свойства на основе значения из story.
     */
    // eslint-disable-next-line complexity
    const inferPropertyType = (value: IBrickValues): PropertyType => {
        if (value.type === 'switch') {
            return 'switch';
        }

        if (value.type === 'textarea') {
            return 'textarea';
        }

        if (value.type === 'image') {
            return 'image';
        }

        if (value.type === 'video') {
            return 'video';
        }

        if (value.type === 'inline-content') {
            return 'inline-content';
        }

        if (value.type === 'tags') {
            return 'tags';
        }

        if (value.type === 'image-gallery') {
            return 'image-gallery';
        }

        if (value.type === 'accordion-items') {
            return 'accordion-items';
        }

        if (value.type === 'color') {
            return 'color';
        }

        if (value.type === 'array') {
            return 'array';
        }

        if (value.type === 'object') {
            return 'object';
        }

        if (value.type === 'select' || value.type === 'tabs' || value.type === 'modal-select') {
            return 'select';
        }

        // Проверяем наличие vars (опций)
        if (value.vars && Array.isArray(value.vars) && value.vars.length > 0) {
            // 2+ опции -> select
            return 'select';
        }

        // Определяем тип по значению default
        if (typeof value.default === 'boolean') {
            return 'boolean';
        }
        if (typeof value.default === 'number') {
            return 'number';
        }
        if (Array.isArray(value.default)) {
            return 'array';
        }
        if (typeof value.default === 'object' && value.default !== null) {
            return 'object';
        }

        return 'string';
    };

    /**
     * Конвертирует значения story в определения свойств.
     */
    const storyValuesToProperties = (
        storyValues: Record<string, IBrickValues>
    ): PropertyDefinition[] => {
        const properties: PropertyDefinition[] = [];

        Object.entries(storyValues).forEach(([key, value]) => {
            const property: PropertyDefinition = {
                name: key,
                label: key.charAt(0).toUpperCase() + key.slice(1),
                type: inferPropertyType(value),
                default: value.default,
                description: value.desc,
                listDelimiter: value.listDelimiter,
                fields: value.fields,
                min: value.min,
                max: value.max,
                step: value.step,
                showWhen: value.showWhen,
                svgContentProperty: value.svgContentProperty,
                unit: value.unit,
                group: value.group,
                responsive: value.responsive,
            };

            // Автоматически инжектим модалки для modal-select
            if (value.type === 'modal-select') {
                property.options = getModalOptions().map((opt) => ({
                    label: opt.label,
                    value: opt.value,
                }));
            }
            // Добавляем опции, если vars существуют
            else if (value.vars && Array.isArray(value.vars) && value.vars.length > 0) {
                property.options = value.vars.map((v) => {
                    // Если элемент уже объект с label и value, использовать как есть
                    if (typeof v === 'object' && v !== null && 'label' in v && 'value' in v) {
                        return {
                            label: String(v.label),
                            value: v.value,
                        };
                    }
                    // Иначе автопреобразование примитива
                    return {
                        label: String(v),
                        value: v,
                    };
                });
            }

            properties.push(property);
        });

        return properties;
    };

    /**
     * Возвращает тип селектора компонента для свойства.
     */
    const getSelectorType = (property: PropertyDefinition): string => {
        switch (property.type) {
            case 'boolean':
                return 'checkbox';
            case 'switch':
                return 'switch';
            case 'select':
                return 'select';
            case 'image':
                return 'image';
            case 'video':
                return 'video';
            case 'tags':
                return 'input';
            case 'number':
            case 'string':
            default:
                return 'input';
        }
    };

    /**
     * Валидирует значение свойства.
     */
    // eslint-disable-next-line complexity
    const validatePropertyValue = (property: PropertyDefinition, value: any): boolean => {
        switch (property.type) {
            case 'boolean':
                return typeof value === 'boolean';
            case 'number':
                return typeof value === 'number' && !isNaN(value);
            case 'string':
                return typeof value === 'string';
            case 'select':
            case 'switch':
                return property.options?.some((opt) => opt.value === value) ?? false;
            case 'array':
            case 'tags':
                return Array.isArray(value);
            case 'object':
                return typeof value === 'object' && value !== null;
            default:
                return true;
        }
    };

    return {
        storyValuesToProperties,
        inferPropertyType,
        getSelectorType,
        validatePropertyValue,
    };
}
