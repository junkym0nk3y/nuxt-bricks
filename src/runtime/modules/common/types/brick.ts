/**
 * Types for Bricks Builder
 */

// Пропсы layout-блоков переехали в layouts-blocks/types/blockProps.d.ts (шаг B1)

export type TBricksDeviceKey = 'mobile' | 'tablet' | 'desktop';

export type TCanvasDragSource = 'canvas' | 'library';

export interface IDragVisualSize {
    width: number;
    height: number;
    isFullWidth?: boolean;
}

export interface ICanvasDragStartPayload extends IDragVisualSize {
    source: TCanvasDragSource;
    componentId?: string | null;
}

export interface ICanvasDragState {
    source: TCanvasDragSource | null;
    componentId: string | null;
    width: number;
    height: number;
    isFullWidth: boolean;
    /**
     * Оригинал перетаскиваемого блока убран из потока. Ставится с задержкой после
     * dragstart, иначе мгновенный display:none на источнике отменяет нативный drag.
     */
    sourceVacated: boolean;
}

/** Значение редактируемого свойства брика (единый источник правды для props-значений) */
export type TBrickPropValue = string | number | boolean | Record<string, unknown> | Array<unknown>;

/** Demo/default-значение brick: TBrickPropValue + редкие примитивы и nullable-варианты */
export type TBrickDemoValues =
    | string
    | number
    | boolean
    | symbol
    | bigint
    | null
    | undefined
    | Record<string, unknown>
    | Array<unknown>;

export interface IDeviceVisibilityConfig {
    mobile: boolean;
    tablet: boolean;
    desktop: boolean;
}

// Component instance on canvas
export interface IComponentSlotDefinition {
    name: string;
    label?: string;
    description?: string;
    allowMultiple?: boolean;
}

export interface IBricksComponentSlot extends IComponentSlotDefinition {
    children: string[];
}

export interface IBricksComponent {
    id: string;
    type: 'layout' | 'component'; // Новое: различаем Layout и обычные компоненты
    componentName: string; // 'grid', 'flex', 'space' для layout, или название UI компонента
    brickPath: string;
    zIndex: number;
    props: Record<string, unknown>;
    // Вложенность
    parent?: string; // ID родительского компонента
    children?: string[]; // Массив ID дочерних компонентов (только для layout)
    slots?: IBricksComponentSlot[];
    slotName?: string;
    fullWidth?: boolean;
    isHidden?: boolean;
    htmlId?: string; // Кастомный HTML id для якорной навигации
    deviceVisibility?: Partial<IDeviceVisibilityConfig>;
    isInteractive?: boolean;
    // Grid positioning (для компонентов внутри Grid Layout)
    gridColumn?: string; // e.g. '1 / 3' or 'span 2'
    gridRow?: string; // e.g. '2 / 4' or 'span 2' or 'auto'
}

// Component library item
export interface IComponentLibraryItem {
    name: string;
    category: string;
    brickPath: string;
    description?: string;
    thumbnail?: string;
    defaultProps?: Record<string, unknown>;
    slots?: IComponentSlotDefinition[];
    isInteractive?: boolean;
}

export interface INavigationItem {
    id: string;
    target: string;
    label: string;
}

export interface INavigationMeta {
    items: INavigationItem[];
}

export interface IBricksSchemaMeta {
    navigation?: INavigationMeta;
    [key: string]: unknown;
}

export interface IBricksSchema {
    components: IBricksComponent[];
    meta?: IBricksSchemaMeta;
}

// Canvas state
export interface ICanvasState {
    width: number;
    height: number;
    scale: number;
    viewport: TBricksDeviceKey;
    isFigmaMode: boolean;
    showGrid: boolean;
    isViewportSwitching: boolean;
    /** Пользователь зумил вручную (wheel/кнопки) — авто-фит не перетирает масштаб */
    hasManualZoom: boolean;
    /** В Figma mode — viewport, на котором последний раз кликнули компонент */
    activeViewport: TBricksDeviceKey | null;
    /** Ограничивать новый компонент только тем viewport, куда его бросили (Figma mode) */
    figmaDropPerViewport: boolean;
    /** Transient drag-state: не сериализуется в schema/history. */
    dragState: ICanvasDragState;
    /** Ширина и высота канваса до входа в Figma mode (для восстановления при выходе) */
    _preFigmaWidth: number | null;
    _preFigmaHeight: number | null;
}

// Property editor types
export type TPropertyType =
    | 'string'
    | 'number'
    | 'boolean'
    | 'select'
    | 'textarea'
    | 'switch'
    | 'input'
    | 'image'
    | 'video'
    | 'color'
    | 'array'
    | 'object'
    | 'readonly'
    | 'inline-content'
    | 'tags'
    | 'image-gallery'
    | 'accordion-items';

export interface IPropertyDefinition {
    name: string;
    type: TPropertyType;
    label: string;
    default: TBrickDemoValues;
    options?: Array<{ label: string; value: TBrickDemoValues }>;
    description?: string;
    listDelimiter?: string;
    /** Минимальное значение для number-свойств */
    min?: number;
    /** Максимальное значение для number-свойств */
    max?: number;
    /** Шаг для number-свойств */
    step?: number;
    showWhen?: {
        field: string;
        equals: unknown;
    };
    /** Конфигурация полей для image-gallery редактора */
    fields?: {
        title?: boolean;
        tags?: boolean;
    };
    /** Имя свойства, куда сохранять svgContent при выборе SVG из галереи */
    svgContentProperty?: string;
    /**
     * Имена свойств, куда сохранять URL уменьшенных вариантов при выборе
     * изображения из галереи (постепенная загрузка).
     *
     * Тем же способом, что `svgContentProperty`: блок хранит картинку строкой, а
     * не id медиа, поэтому вывести адреса вариантов из `src` он не может —
     * расширение варианта не совпадает с расширением полного файла, а у внешних
     * URL вариантов нет вовсе. Догадка «подставить суффикс в имя» давала бы 404
     * на каждой картинке не из медиатеки.
     */
    previewUrlProperty?: string;
    mockUrlProperty?: string;
    /**
     * Имена свойств, куда сохранять пиксельные размеры выбранного изображения.
     *
     * Нужны постепенной загрузке: до попадания кадра во вьюпорт на месте
     * картинки стоит прозрачный 1×1, у которого нет ни высоты, ни пропорции.
     * Место под картинку в этот момент держит `aspect-ratio`, а взять её больше
     * негде — блок хранит картинку строкой, размеры лежат в медиатеке.
     */
    naturalWidthProperty?: string;
    naturalHeightProperty?: string;
    /** Суффикс единицы измерения для инпута (например, 'rem') */
    unit?: string;
    /** Название группы для группировки свойств в сворачиваемый аккордеон */
    group?: string;
    /** Свойство поддерживает адаптивные значения per-breakpoint */
    responsive?: boolean;
}

export type TSidebarView = 'components' | 'publish' | 'schema';

// Selected component
export interface ISelectedComponent {
    id: string;
    properties: IPropertyDefinition[];
    description?: string;
}
