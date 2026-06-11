/**
 * Types for Landing Builder
 */

// Layout component props
export type GridLayoutVariant = 'default' | 'lead-left' | 'lead-right';

export type GridRowHeight = 'auto' | '1fr' | 'min-content' | 'max-content';

export interface GridLayoutProps {
    columns: number;
    rows?: number; // минимум 1
    gap: number;
    variant?: GridLayoutVariant;
    rowHeight?: GridRowHeight; // режим высоты строк
    minRowHeight?: number; // минимальная высота строки в rem
    paddingX?: number; // горизонтальный padding контейнера в rem
    paddingY?: number; // вертикальный padding контейнера в rem
}

export interface FlexLayoutProps {
    direction: 'row' | 'column';
    justify: 'start' | 'center' | 'end' | 'space-between' | 'space-around';
    align: 'stretch' | 'start' | 'center' | 'end' | 'baseline';
    gap: number;
    wrap: boolean;
    paddingX?: number; // горизонтальный padding контейнера в rem
    paddingY?: number; // вертикальный padding контейнера в rem
}

export interface SpaceProps {
    size: string | number; // number в rem (2.4) или строка с единицей ('2.4rem')
    direction: 'vertical' | 'horizontal' | 'both';
    showDivider?: boolean;
    dividerColor?: string; // CSS color, default: var(--bricks-base-200)
    dividerWidth?: number; // px, default: 1
    dividerStyle?: 'solid' | 'dashed' | 'dotted';
    dividerMarginX?: number; // rem, отступы по бокам
}

export interface ISliderCaption {
    text: string;
    subtitle?: string;
}

export interface SliderLayoutProps {
    spaceBetween: number;
    slidesPerViewDesktop: number;
    slidesPerViewTablet: number;
    slidesPerViewMobile: number;
    loop: boolean;
    autoplay: boolean;
    autoplayDelay: number;
    showNavigation: boolean;
    showPagination: boolean;
    captions?: ISliderCaption[];
    captionPosition?: 'top' | 'bottom';
    showCaptionNavigation?: boolean;
}

export interface IAccordionItem {
    title: string;
    content: string;
}

export interface AccordionLayoutProps {
    items: IAccordionItem[];
    allowMultiple: boolean;
    initialOpenIndex: number; // -1 = все закрыты
    gap?: number; // rem, отступ между items (0 = единый блок, >0 = карточный режим)
    borderRadius?: number; // rem, закругление углов
    accentColor?: string; // hex, акцентный цвет
    animationDuration?: number; // ms, скорость анимации
}

export interface SectionLayoutProps {
    backgroundColor?: string; // CSS color / CSS variable
    backgroundImage?: string; // URL фонового изображения
    paddingTop?: number; // rem
    paddingBottom?: number; // rem
    paddingX?: number; // rem
    borderRadius?: number; // rem
    minHeight?: number; // rem, минимальная высота секции
}

export interface IBlockSvgProps {
    componentId?: string;
    src?: string; // URL из медиа-галереи
    svgContent?: string; // Raw SVG content (заполняется через svgContentProperty)
    color?: string; // CSS color — применяется к fill/stroke
    width?: string | number; // rem или CSS value
    height?: string | number; // rem или CSS value
    alignment?: 'left' | 'center' | 'right';
    marginTop?: number;
    marginBottom?: number;
}

export type TLandingDeviceKey = 'mobile' | 'tablet' | 'desktop';

export interface IDeviceVisibilityConfig {
    mobile: boolean;
    tablet: boolean;
    desktop: boolean;
}

export type LayoutProps =
    | GridLayoutProps
    | FlexLayoutProps
    | SpaceProps
    | SliderLayoutProps
    | AccordionLayoutProps
    | SectionLayoutProps
    | IBlockSvgProps;

// Component instance on canvas
export interface ComponentSlotDefinition {
    name: string;
    label?: string;
    description?: string;
    allowMultiple?: boolean;
}

export interface LandingComponentSlot extends ComponentSlotDefinition {
    children: string[];
}

export interface LandingComponent {
    id: string;
    type: 'layout' | 'component'; // Новое: различаем Layout и обычные компоненты
    componentName: string; // 'grid', 'flex', 'space' для layout, или название UI компонента
    storyPath: string;
    zIndex: number;
    props: Record<string, any>;
    // Вложенность
    parent?: string; // ID родительского компонента
    children?: string[]; // Массив ID дочерних компонентов (только для layout)
    slots?: LandingComponentSlot[];
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

export interface ILandingSchemaMeta {
    navigation?: INavigationMeta;
    [key: string]: unknown;
}

export interface LandingSchema {
    components: LandingComponent[];
    meta?: ILandingSchemaMeta;
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
