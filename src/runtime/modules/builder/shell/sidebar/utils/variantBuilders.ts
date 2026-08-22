// #region Imports
// Types
import type {
    IPropertyDefinition,
    TBrickPropValue,
    TPropertyType,
} from '../../../../common/types/brick';
import type {
    IPropertyVariantContext,
    TComponentVariantsMap,
    TPropertyEditorType,
} from '../components/property-editors/types';

// Utils
import {
    formatDisplayValue,
    formatPrimitiveArrayValue,
    isPrimitiveArrayValue,
} from './propertyFormatters';
import { readOwnKey } from '../../../../common/utils/safeRecord';
// #endregion

// #region Interfaces
export interface IVariantBuilderTools {
    /**
     * Resolves the label of a property: `bricks.*` keys are translated, custom strings
     * are kept as they are
     */
    resolveLabel: (property: IPropertyDefinition) => string;
    /** i18n translator for the captions of the panel itself, the switch label among them */
    t: (key: string) => string;
}

export type TVariantBuilder = (
    context: IPropertyVariantContext,
    tools: IVariantBuilderTools
) => void;
// #endregion

/**
 * Current value of the property, read from the props of the component.
 *
 * The name of the property is declared by a brick file while the props come from the
 * schema, so only an own key is read: `componentProps['toString']` would otherwise
 * return the prototype method, and `Boolean(...)` of it would be true for any schema.
 *
 * @param context - Context of the property (its definition plus the component props).
 * @returns Value of the prop, or undefined when there is no own key.
 */
function readPropValue(context: IPropertyVariantContext): unknown {
    return readOwnKey(context.componentProps, context.property.name);
}

/**
 * Array value of the property, falling back to a non-empty default.
 */
function resolveArrayValue(context: IPropertyVariantContext): Array<unknown> {
    const { property } = context;
    const currentValue = readPropValue(context);
    const fallback =
        Array.isArray(property.default) && property.default.length > 0 ? property.default : [];
    return Array.isArray(currentValue) ? currentValue : fallback;
}

/**
 * Builder for the editors that take an array of values with a fallback to the default
 * (image-gallery, accordion-items).
 */
function createArrayValueBuilder(editorType: TPropertyEditorType): TVariantBuilder {
    return (context, tools) => {
        context.variants[editorType].push({
            label: tools.resolveLabel(context.property),
            value: resolveArrayValue(context),
            disabled: false,
            property: context.property,
        });
    };
}

/**
 * Builder for the editors with a formatted string value (color, image, video).
 */
function createDisplayValueBuilder(editorType: TPropertyEditorType): TVariantBuilder {
    return (context, tools) => {
        context.variants[editorType].push({
            label: tools.resolveLabel(context.property),
            value: formatDisplayValue(readPropValue(context)),
            disabled: false,
            property: context.property,
        });
    };
}

/**
 * Builder of the boolean variant (a checkbox).
 */
function buildBooleanVariant(context: IPropertyVariantContext, tools: IVariantBuilderTools): void {
    context.variants.boolean.push({
        label: tools.resolveLabel(context.property),
        value: Boolean(readPropValue(context)),
        disabled: false,
        property: context.property,
    });
}

/**
 * Builder of the switch variant (a toggle).
 */
function buildSwitchVariant(context: IPropertyVariantContext, tools: IVariantBuilderTools): void {
    context.variants.switch.push({
        label: tools.resolveLabel(context.property),
        value: Boolean(readPropValue(context)),
        disabled: false,
        trueValue: true,
        falseValue: false,
        trueLabel: tools.t('bricks.properties.switchOn'),
        falseLabel: '',
        size: 'small',
        property: context.property,
    });
}

/**
 * Builder of the textarea variant (multi-line text).
 */
function buildTextareaVariant(context: IPropertyVariantContext, tools: IVariantBuilderTools): void {
    const { property } = context;
    context.variants.textarea.push({
        label: tools.resolveLabel(property),
        value: formatDisplayValue(readPropValue(context)),
        disabled: false,
        placeholder: `Enter ${property.label || property.name}`,
        property,
    });
}

/**
 * Builder of the tags variant (an array of strings edited as chips).
 */
function buildTagsVariant(context: IPropertyVariantContext, tools: IVariantBuilderTools): void {
    const { property } = context;
    const currentValue = readPropValue(context);
    const fallback = Array.isArray(property.default) ? property.default : [];
    const source = Array.isArray(currentValue) ? currentValue : fallback;
    const value = source.map((item) => String(item).trim()).filter((item) => Boolean(item));

    context.variants.tags.push({
        label: tools.resolveLabel(property),
        value,
        disabled: false,
        property,
    });
}

/**
 * Builder of the array variant: a primitive array goes to the input as CSV, the rest
 * go to the json editor.
 */
function buildArrayVariant(context: IPropertyVariantContext, tools: IVariantBuilderTools): void {
    const { property } = context;
    const currentValue = readPropValue(context);
    const primitiveSource =
        (Array.isArray(currentValue) && isPrimitiveArrayValue(currentValue)
            ? currentValue
            : null) ||
        (Array.isArray(property.default) && isPrimitiveArrayValue(property.default)
            ? property.default
            : null);

    if (primitiveSource) {
        context.variants.input.push({
            label: tools.resolveLabel(property),
            value: formatPrimitiveArrayValue(
                Array.isArray(currentValue) ? currentValue : primitiveSource
            ),
            disabled: false,
            placeholder: 'item1, item2, item3',
            property,
        });
        return;
    }

    context.variants.json.push({
        label: tools.resolveLabel(property),
        value: (currentValue ?? property.default ?? []) as TBrickPropValue,
        disabled: false,
        property,
    });
}

/**
 * Builder of the object variant (the json editor).
 */
function buildObjectVariant(context: IPropertyVariantContext, tools: IVariantBuilderTools): void {
    const { property } = context;
    context.variants.json.push({
        label: tools.resolveLabel(property),
        value: (readPropValue(context) ?? property.default ?? {}) as TBrickPropValue,
        disabled: false,
        property,
    });
}

/**
 * Registry of the variant builders, keyed by property type. A type with no builder is
 * handled by the select heuristic or by the fallback input (see `usePropertyVariants`).
 */
export const VARIANT_BUILDERS: Partial<Record<TPropertyType, TVariantBuilder>> = {
    boolean: buildBooleanVariant,
    switch: buildSwitchVariant,
    textarea: buildTextareaVariant,
    'image-gallery': createArrayValueBuilder('image-gallery'),
    'accordion-items': createArrayValueBuilder('accordion-items'),
    tags: buildTagsVariant,
    color: createDisplayValueBuilder('color'),
    image: createDisplayValueBuilder('image'),
    video: createDisplayValueBuilder('video'),
    array: buildArrayVariant,
    object: buildObjectVariant,
};

/**
 * Builder of the select variant: fires for any property carrying two or more options,
 * whatever its type. Returns true when the variant was added.
 */
export function buildSelectVariant(
    context: IPropertyVariantContext,
    tools: IVariantBuilderTools,
    resolveOptionLabel: (label: string) => string
): boolean {
    const { property } = context;
    if (!Array.isArray(property.options) || property.options.length < 2) {
        return false;
    }

    const options = property.options;

    context.variants.select.push({
        label: tools.resolveLabel(property),
        value: String(readPropValue(context) ?? options[0]?.value ?? ''),
        specs: options.map((option) => ({
            label: resolveOptionLabel(String(option.label)),
            value: String(option.value),
        })),
        facets: options.map((option) => String(option.value)),
        disabled: false,
        property,
    });

    return true;
}

/**
 * Fallback builder: the input variant, a plain text field.
 */
export function buildInputVariant(
    context: IPropertyVariantContext,
    tools: IVariantBuilderTools
): void {
    context.variants.input.push({
        label: tools.resolveLabel(context.property),
        value: formatDisplayValue(readPropValue(context)),
        disabled: false,
        property: context.property,
    });
}

/**
 * Creates the empty variant structure for every editor type.
 */
export function createEmptyVariants(order: readonly TPropertyEditorType[]): TComponentVariantsMap {
    return order.reduce((acc, key) => {
        acc[key] = [];
        return acc;
    }, {} as TComponentVariantsMap);
}
