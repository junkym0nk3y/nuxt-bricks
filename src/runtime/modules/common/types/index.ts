export interface ILandingFileStructure {
    category?: string;
    description?: string;
    values: Record<string, IBrickValues>;
    slots?: Record<string, IBrickSlotDefinition> | Array<string | IBrickSlotDefinition>;
}

export type IBrickDemoValues =
    | string
    | number
    | boolean
    | symbol
    | bigint
    | null
    | undefined
    | Record<string, unknown>
    | Array<string | number | boolean | Record<string, unknown> | Array<unknown>>;

/**
 * Конфигурация дополнительных полей для image-gallery редактора.
 */
export interface IBrickGalleryFieldsConfig {
    /** Показывать поле title (default: true) */
    title?: boolean;
    /** Показывать поле caption (default: false) */
    caption?: boolean;
    /** Показывать редактор тегов (default: false) */
    tags?: boolean;
}

export interface IBrickShowWhen {
    field: string;
    equals: IBrickDemoValues;
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
    default?: IBrickDemoValues;
    defaultValue?: IBrickDemoValues;
    newValue?: IBrickDemoValues;
    desc?: string;
    vars?: IBrickDemoValues[];
    listDelimiter?: string;
    /** Конфигурация полей для image-gallery */
    fields?: IBrickGalleryFieldsConfig;
    /** При изменении пропа с forceRender компонент полностью пересоздаётся (для lazy-load) */
    forceRender?: boolean;
    /** Минимальное значение для number-свойств */
    min?: number;
    /** Максимальное значение для number-свойств */
    max?: number;
    /** Шаг для number-свойств */
    step?: number;
    showWhen?: IBrickShowWhen;
    /** Имя свойства, куда сохранять svgContent при выборе SVG из галереи */
    svgContentProperty?: string;
    /** Суффикс единицы измерения для инпута (например, 'rem') */
    unit?: string;
    /** Название группы для группировки свойств в сворачиваемый аккордеон */
    group?: string;
    /** Свойство поддерживает адаптивные значения per-breakpoint */
    responsive?: boolean;
}

export interface IBrickSlotDefinition {
    label?: string;
    description?: string;
    allowMultiple?: boolean;
}

export interface IBrickExportModule {
    default?: unknown;
    story?: {
        values?: Record<string, IBrickValues>;
        category?: string;
        description?: string;
        slots?: Record<string, IBrickSlotDefinition> | Array<string | IBrickSlotDefinition>;
        dataSources?: import('../../render/types/landing-data-source').IBrickDataSource[];
    };
}

export type { IBrickDataSource, IBrickDataSourceParam } from '../../render/types/landing-data-source';
export type { IGalleryItem, IInlineContentSegment } from '../../layouts-blocks/types/layouts';
