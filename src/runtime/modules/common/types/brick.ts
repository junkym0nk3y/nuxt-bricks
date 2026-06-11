/**
 * Types for Bricks Builder
 */

// Пропсы layout-блоков переехали в layouts-blocks/types/blockProps.d.ts (шаг B1)

export type TBricksDeviceKey = 'mobile' | 'tablet' | 'desktop';

export interface IDeviceVisibilityConfig {
    mobile: boolean;
    tablet: boolean;
    desktop: boolean;
}

// Component instance on canvas
export interface ComponentSlotDefinition {
    name: string;
    label?: string;
    description?: string;
    allowMultiple?: boolean;
}

export interface BricksComponentSlot extends ComponentSlotDefinition {
    children: string[];
}

export interface BricksComponent {
    id: string;
    type: 'layout' | 'component'; // Новое: различаем Layout и обычные компоненты
    componentName: string; // 'grid', 'flex', 'space' для layout, или название UI компонента
    storyPath: string;
    zIndex: number;
    props: Record<string, any>;
    // Вложенность
    parent?: string; // ID родительского компонента
    children?: string[]; // Массив ID дочерних компонентов (только для layout)
    slots?: BricksComponentSlot[];
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
export interface ComponentLibraryItem {
    name: string;
    category: string;
    storyPath: string;
    description?: string;
    thumbnail?: string;
    defaultProps?: Record<string, any>;
    slots?: ComponentSlotDefinition[];
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

export interface BricksSchema {
    components: BricksComponent[];
    meta?: IBricksSchemaMeta;
}

// Canvas state
export interface CanvasState {
    width: number;
    height: number;
    scale: number;
    viewport: 'mobile' | 'tablet' | 'desktop';
    isFigmaMode: boolean;
    showGrid: boolean;
    isViewportSwitching: boolean;
    /** В Figma mode — viewport, на котором последний раз кликнули компонент */
    activeViewport: 'mobile' | 'tablet' | 'desktop' | null;
    /** Ограничивать новый компонент только тем viewport, куда его бросили (Figma mode) */
    figmaDropPerViewport: boolean;
    /** Ширина и высота канваса до входа в Figma mode (для восстановления при выходе) */
    _preFigmaWidth: number | null;
    _preFigmaHeight: number | null;
}

// Property editor types
export type PropertyType =
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

export interface PropertyDefinition {
    name: string;
    type: PropertyType;
    label: string;
    default: any;
    options?: Array<{ label: string; value: any }>;
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
    /** Суффикс единицы измерения для инпута (например, 'rem') */
    unit?: string;
    /** Название группы для группировки свойств в сворачиваемый аккордеон */
    group?: string;
    /** Свойство поддерживает адаптивные значения per-breakpoint */
    responsive?: boolean;
}

export type SidebarView = 'components' | 'properties' | 'publish' | 'schema';

// Sidebar state
export interface SidebarState {
    left: {
        visible: boolean;
        width: string;
    };
}

// Selected component
export interface SelectedComponent {
    id: string;
    properties: PropertyDefinition[];
    description?: string;
}
