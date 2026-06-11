import type { PropertyDefinition } from '../../../common/types/landing';

export interface ISelectOption {
    label: string;
    value: string;
}

export interface IComponentVariant {
    label: string;
    value: string | boolean | number | Record<string, unknown> | Array<unknown>;
    disabled: boolean;
    placeholder?: string;
    specs?: ISelectOption[];
    facets?: string[];
    trueValue?: string | boolean;
    trueLabel?: string;
    falseValue?: string | boolean;
    falseLabel?: string;
    size?: 'small' | 'medium';
    property: PropertyDefinition;
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

export type PropertyEditorType = (typeof PROPERTY_EDITOR_ORDER)[number];

export type ComponentVariantsMap = Record<PropertyEditorType, IComponentVariant[]>;

export interface PropertyVariantContext {
    property: PropertyDefinition;
    componentProps: Record<string, unknown>;
    variants: ComponentVariantsMap;
}
