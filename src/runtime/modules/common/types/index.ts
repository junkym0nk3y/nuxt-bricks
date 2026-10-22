import type { TBrickDemoValues } from './brick';

export type { TBrickDemoValues } from './brick';

export interface IBrickFileStructure {
    category?: string;
    description?: string;
    values: Record<string, IBrickValues>;
    slots?: Record<string, IBrickSlotDefinition> | Array<string | IBrickSlotDefinition>;
}

/**
 * Configuration of the additional fields of the image-gallery editor.
 */
export interface IBrickGalleryFieldsConfig {
    /** Whether to show the title field (default: true) */
    title?: boolean;
    /** Whether to show the caption field (default: false) */
    caption?: boolean;
    /** Whether to show the tags editor (default: false) */
    tags?: boolean;
}

export interface IBrickShowWhen {
    field: string;
    equals: TBrickDemoValues;
}

export interface IBrickValues {
    type:
        | 'select'
        | 'tabs'
        | 'switch'
        | 'input'
        | 'boolean'
        | 'interaction'
        | 'readonly'
        | 'image'
        | 'video'
        | 'array'
        | 'object'
        | 'modal-select'
        | 'image-gallery'
        | 'inline-content'
        | 'tags'
        | string;
    default?: TBrickDemoValues;
    defaultValue?: TBrickDemoValues;
    newValue?: TBrickDemoValues;
    desc?: string;
    vars?: TBrickDemoValues[];
    listDelimiter?: string;
    /** Field configuration for the image gallery */
    fields?: IBrickGalleryFieldsConfig;
    /** When a prop with forceRender changes, the component is recreated entirely (for lazy loading) */
    forceRender?: boolean;
    /** Minimum value for number properties */
    min?: number;
    /** Maximum value for number properties */
    max?: number;
    /** Step for number properties */
    step?: number;
    showWhen?: IBrickShowWhen;
    /** Name of the property to store svgContent in when an SVG is picked from the gallery */
    svgContentProperty?: string;
    /** Unit suffix for the input (for example, 'rem') */
    unit?: string;
    /** Group name that folds the properties into a collapsible accordion */
    group?: string;
    /** The property supports responsive values per breakpoint */
    responsive?: boolean;
}

export interface IBrickSlotDefinition {
    /** Slot name — required in the array notation, in the Record notation it comes from the key */
    name?: string;
    label?: string;
    description?: string;
    allowMultiple?: boolean;
}

export interface IBrickExportModule {
    default?: unknown;
    brick?: {
        values?: Record<string, IBrickValues>;
        category?: string;
        description?: string;
        slots?: Record<string, IBrickSlotDefinition> | Array<string | IBrickSlotDefinition>;
        dataSources?: import('./dataSource').IBrickDataSource[];
    };
}

export type { IBrickDataSource, IBrickDataSourceParam } from './dataSource';
export type { IGalleryItem, IInlineContentSegment } from './content';
