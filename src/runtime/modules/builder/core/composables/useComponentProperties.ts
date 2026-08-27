import type {
    TBrickDemoValues,
    IPropertyDefinition,
    TPropertyType,
} from '../../../common/types/brick';
import type { IBrickValues } from '../../../common/types/index';
import { readOwnKey } from '../../../common/utils/safeRecord';
import { getModalOptions } from './useModalOptions';

/**
 * Editor type declared by a brick value mapped to the property type of the panel.
 *
 * The list carries exactly the types that used to be resolved by equality, and not one
 * more. `number`, `string`, `boolean`, `input`, `interaction` and `readonly` are absent
 * on purpose: they fall through to the options and to the inference from the default
 * value, so declaring them here would take a property with `vars` away from the select
 * editor. Three of the keys are aliases — `select`, `tabs` and `modal-select` are all
 * edited as a select.
 */
const PROPERTY_TYPE_BY_BRICK_TYPE = {
    switch: 'switch',
    textarea: 'textarea',
    image: 'image',
    video: 'video',
    'inline-content': 'inline-content',
    tags: 'tags',
    'image-gallery': 'image-gallery',
    'accordion-items': 'accordion-items',
    color: 'color',
    array: 'array',
    object: 'object',
    select: 'select',
    tabs: 'select',
    'modal-select': 'select',
} as const satisfies Record<string, TPropertyType>;

/**
 * Infers the property type from a brick value.
 *
 * The key comes from a `.brick.ts` file of the consumer, so the map is read by own key:
 * a type named `toString` or `constructor` would otherwise return a method of the
 * prototype. An unknown type is no refusal — it degrades into the inference below,
 * otherwise a type added later would silently block the editing of its property.
 *
 * @param value - Declaration of the property in the brick file.
 * @returns Property type of the panel.
 */
function inferPropertyType(value: IBrickValues): TPropertyType {
    const declared = readOwnKey<TPropertyType>(PROPERTY_TYPE_BY_BRICK_TYPE, value.type);
    if (declared) {
        return declared;
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
}

/**
 * Composable for working with the properties of components.
 */
export function useComponentProperties() {
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

    return {
        brickValuesToProperties,
    };
}
