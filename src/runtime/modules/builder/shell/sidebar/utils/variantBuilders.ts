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
    /** Резолвит label свойства (ключи `bricks.*` переводятся, кастомные строки — как есть). */
    resolveLabel: (property: IPropertyDefinition) => string;
    /** i18n-переводчик для служебных подписей (например, label переключателя). */
    t: (key: string) => string;
}

export type TVariantBuilder = (
    context: IPropertyVariantContext,
    tools: IVariantBuilderTools
) => void;
// #endregion

/**
 * Возвращает текущее значение свойства из пропсов компонента.
 *
 * Имя свойства объявляет brick-файл, а пропсы приходят из схемы, поэтому читаем
 * только own-ключ: `componentProps['toString']` иначе вернул бы метод прототипа,
 * и `Boolean(...)` от него был бы истинным при любой схеме.
 *
 * @param context - Контекст свойства (определение + пропсы компонента).
 * @returns Значение пропа либо undefined, если own-ключа нет.
 */
function readPropValue(context: IPropertyVariantContext): unknown {
    return readOwnKey(context.componentProps, context.property.name);
}

/**
 * Возвращает значение-массив свойства с fallback на непустой default.
 */
function resolveArrayValue(context: IPropertyVariantContext): Array<unknown> {
    const { property } = context;
    const currentValue = readPropValue(context);
    const fallback =
        Array.isArray(property.default) && property.default.length > 0 ? property.default : [];
    return Array.isArray(currentValue) ? currentValue : fallback;
}

/**
 * Билдер для редакторов, принимающих массив значений с fallback на default
 * (inline-content, image-gallery, accordion-items).
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
 * Билдер для редакторов с отформатированным строковым значением (color, image, video).
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
 * Билдер boolean-варианта (чекбокс).
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
 * Билдер switch-варианта (переключатель).
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
 * Билдер textarea-варианта (многострочный текст).
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
 * Билдер tags-варианта (массив строк с chips-редактором).
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
 * Билдер array-варианта: примитивные массивы — в input (CSV), остальные — в json.
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
 * Билдер object-варианта (json-редактор).
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
 * Реестр билдеров вариантов по типу свойства. Типы без билдера
 * обрабатываются select-эвристикой либо fallback-инпутом (см. usePropertyVariants).
 */
export const VARIANT_BUILDERS: Partial<Record<TPropertyType, TVariantBuilder>> = {
    boolean: buildBooleanVariant,
    switch: buildSwitchVariant,
    textarea: buildTextareaVariant,
    'inline-content': createArrayValueBuilder('inline-content'),
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
 * Билдер select-варианта: срабатывает для любого свойства с options (2+),
 * независимо от типа. Возвращает true, если вариант добавлен.
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
 * Fallback-билдер: input-вариант (текстовое поле по умолчанию).
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
 * Создает пустую структуру вариантов для всех типов редакторов.
 */
export function createEmptyVariants(order: readonly TPropertyEditorType[]): TComponentVariantsMap {
    return order.reduce((acc, key) => {
        acc[key] = [];
        return acc;
    }, {} as TComponentVariantsMap);
}
