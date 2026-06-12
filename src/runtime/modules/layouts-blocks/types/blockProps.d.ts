/**
 * Пропсы layout-блоков (Grid/Flex/Space/Slider/Accordion/Section/Svg).
 * Домен layouts-blocks — владелец этих контрактов; canvas/render/sidebar импортируют отсюда.
 */

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

export interface IBlockGridOverlayProps {
    containerSize: { width: number; height: number };
    columns: number;
    gap: number;
    rowSizes: number[];
}

export interface IBlockSliderCaptionsProps {
    captions: ISliderCaption[];
    activeIndex: number;
}

export interface IBlockSliderCaptionsEmits {
    select: [index: number];
}

export type LayoutProps =
    | GridLayoutProps
    | FlexLayoutProps
    | SpaceProps
    | SliderLayoutProps
    | AccordionLayoutProps
    | SectionLayoutProps
    | IBlockSvgProps;
