export interface ILandingFileStructure {
    category?: string;
    description?: string;
    values: Record<string, ILandValues>;
    slots?: Record<string, ILandSlotDefinition> | Array<string | ILandSlotDefinition>;
}

export type ILandDemoValues =
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
export interface ILandGalleryFieldsConfig {
    /** Показывать поле title (default: true) */
    title?: boolean;
    /** Показывать поле caption (default: false) */
    caption?: boolean;
    /** Показывать редактор тегов (default: false) */
    tags?: boolean;
}

export interface ILandShowWhen {
    field: string;
    equals: ILandDemoValues;
}

export interface ILandValues {
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
    default?: ILandDemoValues;
    defaultValue?: ILandDemoValues;
    newValue?: ILandDemoValues;
    desc?: string;
    vars?: ILandDemoValues[];
    listDelimiter?: string;
    /** Конфигурация полей для image-gallery */
    fields?: ILandGalleryFieldsConfig;
    /** При изменении пропа с forceRender компонент полностью пересоздаётся (для lazy-load) */
    forceRender?: boolean;
    /** Минимальное значение для number-свойств */
    min?: number;
    /** Максимальное значение для number-свойств */
    max?: number;
    /** Шаг для number-свойств */
    step?: number;
    showWhen?: ILandShowWhen;
    /** Имя свойства, куда сохранять svgContent при выборе SVG из галереи */
    svgContentProperty?: string;
    /** Суффикс единицы измерения для инпута (например, 'rem') */
    unit?: string;
    /** Название группы для группировки свойств в сворачиваемый аккордеон */
    group?: string;
    /** Свойство поддерживает адаптивные значения per-breakpoint */
    responsive?: boolean;
}

export interface ILandSlotDefinition {
    label?: string;
    description?: string;
    allowMultiple?: boolean;
}

export interface ILandExportModule {
    default?: unknown;
    story?: {
        values?: Record<string, ILandValues>;
        category?: string;
        description?: string;
        slots?: Record<string, ILandSlotDefinition> | Array<string | ILandSlotDefinition>;
        dataSources?: import('../../render/types/landing-data-source').ILandDataSource[];
    };
}

export type { ILandDataSource, ILandDataSourceParam } from '../../render/types/landing-data-source';
export type { IGalleryItem, IInlineContentSegment } from '../../layouts-blocks/types/layouts';
