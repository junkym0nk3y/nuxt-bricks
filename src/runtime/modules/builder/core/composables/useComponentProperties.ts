import type {
    TBrickDemoValues,
    IPropertyDefinition,
    TPropertyType,
} from '../../../common/types/brick';
import type { IBrickValues } from '../../../common/types/index';
import { getModalOptions } from './useModalOptions';

/**
 * Property type mapped to the selector type of the panel; a missing type → 'input'.
 */
const SELECTOR_TYPE_BY_PROPERTY: Partial<Record<TPropertyType, string>> = {
    boolean: 'checkbox',
    switch: 'switch',
    select: 'select',
    image: 'image',
    video: 'video',
    tags: 'input',
    number: 'input',
    string: 'input',
};

/**
 * Composable for working with the properties of components.
 */
export function useComponentProperties() {
    /**
     * Infers the property type from a brick value.
     */
    // eslint-disable-next-line complexity
    const inferPropertyType = (value: IBrickValues): TPropertyType => {
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

        // A declared list of options wins over a primitive type: with `vars` the
        // property is edited as a select
        if (value.vars && Array.isArray(value.vars) && value.vars.length > 0) {
            return 'select';
        }

        // No editor type declared and no options: the type comes from the default value
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
     * Converts brick values into property definitions.
     */
    const brickValuesToProperties = (
        brickValues: Record<string, IBrickValues>
    ): IPropertyDefinition[] => {
        const properties: IPropertyDefinition[] = [];

        Object.entries(brickValues).forEach(([key, value]) => {
            const property: IPropertyDefinition = {
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

            // The modal list is injected automatically for modal-select
            if (value.type === 'modal-select') {
                property.options = getModalOptions().map((opt) => ({
                    label: opt.label,
                    value: opt.value,
                }));
            }
            // Options are added when `vars` carries at least one entry
            else if (value.vars && Array.isArray(value.vars) && value.vars.length > 0) {
                property.options = value.vars.map((v) => {
                    // An entry that already is an object with a label and a value is
                    // taken as it is
                    if (typeof v === 'object' && v !== null && 'label' in v && 'value' in v) {
                        return {
                            label: String(v.label),
                            value: v.value as TBrickDemoValues,
                        };
                    }
                    // A primitive is converted on its own
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
     * Reads the selector type a property is edited with.
     */
    const getSelectorType = (property: IPropertyDefinition): string => {
        return SELECTOR_TYPE_BY_PROPERTY[property.type] ?? 'input';
    };

    /**
     * Validates the value of a property.
     */
    // eslint-disable-next-line complexity
    const validatePropertyValue = (property: IPropertyDefinition, value: unknown): boolean => {
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
        brickValuesToProperties,
        inferPropertyType,
        getSelectorType,
        validatePropertyValue,
    };
}
