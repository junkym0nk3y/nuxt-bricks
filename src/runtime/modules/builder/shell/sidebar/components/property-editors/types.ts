import type { IPropertyDefinition, TBrickPropValue } from '../../../../../common/types/brick';
import type { IGalleryItem } from '../../../../../common/types/content';
import type { IAccordionItem } from '../../../../../layouts-blocks/types/blockProps';
import type { IBrickGalleryFieldsConfig } from '../../../../../common/types/index';

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
 * Allow-list of the numeric spacing properties: a group made up entirely of them is
 * rendered by the composite box-model editor instead of flat inputs.
 */
export const SPACING_PROPERTY_NAMES: ReadonlySet<string> = new Set([
    'paddingTop',
    'paddingBottom',
    'paddingX',
    'paddingY',
    'marginTop',
    'marginBottom',
]);

/**
 * Names of the pair of numeric properties the panel draws as a single composite grid
 * size editor. These properties have no group, so the pair is intercepted right in
 * the flat list; a block with no `rows` (flex) falls outside the rule.
 */
export const GRID_SIZE_PROPERTY_NAMES = {
    columns: 'columns',
    rows: 'rows',
} as const;

/** The "columns/rows" pair of variants consumed by the grid size editor */
export interface IGridSizeVariants {
    columnsVariant: IComponentVariant;
    rowsVariant: IComponentVariant;
}

export const PROPERTY_EDITOR_ORDER = [
    'boolean',
    'switch',
    'select',
    'input',
    'textarea',
    'json',
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

/** Editable side of the box model: a stepper with a value */
export interface ISpacingStepperSlot {
    kind: 'stepper';
    side: TSpacingSideKey;
    variant: IComponentVariant;
    value: number;
}

/** Read-only mirror of the paired side (paddingX/paddingY are shown on both sides) */
interface ISpacingMirrorSlot {
    kind: 'mirror';
    side: TSpacingSideKey;
    value: number;
}

export type TSpacingSlot = ISpacingStepperSlot | ISpacingMirrorSlot;

export interface IPropertyImageGalleryEditorProps {
    modelValue?: IGalleryItem[];
    label?: string;
    /** Configuration of the extra fields (title, tags) */
    fields?: IBrickGalleryFieldsConfig;
}

export interface IPropertyImageGalleryEditorEmits {
    'update:modelValue': [value: IGalleryItem[]];
    openGallery: [
        {
            action: 'append' | 'replace';
            itemIndex?: number;
            insertIndex?: number;
        },
    ];
}

export interface IPropertyMediaPickerProps {
    modelValue?: string;
    label?: string;
    type?: 'image' | 'video';
}

export interface IPropertyMediaPickerEmits {
    'update:modelValue': [value: string];
    openGallery: [];
}

export interface IPropertyAccordionItemsEditorProps {
    modelValue?: IAccordionItem[];
    label?: string;
}

export interface IPropertyAccordionItemsEditorEmits {
    'update:modelValue': [value: IAccordionItem[]];
}

/** Kind of a token of the JSON highlight layer; `plain` is text the lexer did not recognize */
type TJsonTokenKind = 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punctuation' | 'plain';

/** One token of the highlight layer: its kind and the text as it stands in the field */
export interface IJsonHighlightToken {
    kind: TJsonTokenKind;
    text: string;
}

export interface IPropertyJsonEditorProps {
    modelValue?: unknown;
    label?: string;
}

export interface IPropertyJsonEditorEmits {
    'update:modelValue': [value: unknown];
}
