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

/**
 * Белый список числовых spacing-свойств: группа, целиком состоящая из них,
 * рендерится композитным box-model редактором вместо плоских инпутов.
 */
export const SPACING_PROPERTY_NAMES: ReadonlySet<string> = new Set([
    'paddingTop',
    'paddingBottom',
    'paddingX',
    'paddingY',
    'marginTop',
    'marginBottom',
]);

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

export type TSpacingSideKey = 'top' | 'bottom' | 'left' | 'right';

/** Редактируемая сторона box-model: степпер со значением. */
export interface ISpacingStepperSlot {
    kind: 'stepper';
    side: TSpacingSideKey;
    variant: IComponentVariant;
    value: number;
}

/** Read-only зеркало парной стороны (paddingX/paddingY показываются с двух сторон). */
export interface ISpacingMirrorSlot {
    kind: 'mirror';
    side: TSpacingSideKey;
    value: number;
}

export type TSpacingSlot = ISpacingStepperSlot | ISpacingMirrorSlot;
