import type { IPropertyDefinition, TBrickPropValue } from '../../../../../common/types/brick';

interface ISelectOption {
    label: string;
    value: string;
}

export interface IComponentVariant {
    label: string;
    value: TBrickPropValue;
    disabled: boolean;
    placeholder?: string;
    specs?: ISelectOption[];
    facets?: string[];
    trueValue?: string | boolean;
    trueLabel?: string;
    falseValue?: string | boolean;
    falseLabel?: string;
    size?: 'small' | 'medium';
    property: IPropertyDefinition;
}

export const PROPERTY_EDITOR_ORDER = [
    'boolean',
    'switch',
    'select',
    'input',
    'textarea',
    'json',
    'inline-content',
    'tags',
    'color',
    'image-gallery',
    'accordion-items',
    'image',
    'video',
] as const;

export type TPropertyEditorType = (typeof PROPERTY_EDITOR_ORDER)[number];

export type TComponentVariantsMap = Record<TPropertyEditorType, IComponentVariant[]>;

export interface IPropertyVariantContext {
    property: IPropertyDefinition;
    componentProps: Record<string, unknown>;
    variants: TComponentVariantsMap;
}
