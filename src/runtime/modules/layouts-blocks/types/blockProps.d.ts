/**
 * Пропсы layout-блоков (Grid/Flex/Space/Slider/Accordion/Section/Svg).
 * Домен layouts-blocks — владелец этих контрактов; canvas/render/sidebar импортируют отсюда.
 */

import type { IBricksComponent } from '../../common/types/brick';
import type { VNodeChild } from 'vue';

export type TGridLayoutVariant = 'default' | 'lead-left' | 'lead-right';

export type TGridRowHeight = 'auto' | '1fr' | 'min-content' | 'max-content';

export interface IGridLayoutProps {
    columns: number;
    rows?: number; // минимум 1
    gap: number;
    variant?: TGridLayoutVariant;
    rowHeight?: TGridRowHeight; // режим высоты строк
    minRowHeight?: number; // минимальная высота строки в rem
    paddingX?: number; // горизонтальный padding контейнера в rem
    paddingY?: number; // вертикальный padding контейнера в rem
}

export interface IFlexLayoutProps {
    direction: 'row' | 'column';
    justify: 'start' | 'center' | 'end' | 'space-between' | 'space-around';
    align: 'stretch' | 'start' | 'center' | 'end' | 'baseline';
    gap: number;
    wrap: boolean;
    paddingX?: number; // горизонтальный padding контейнера в rem
    paddingY?: number; // вертикальный padding контейнера в rem
}

export interface ISpaceProps {
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

export interface ISliderLayoutProps {
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

export interface IAccordionLayoutProps {
    items: IAccordionItem[];
    allowMultiple: boolean;
    initialOpenIndex: number; // -1 = все закрыты
    gap?: number; // rem, отступ между items (0 = единый блок, >0 = карточный режим)
    borderRadius?: number; // rem, закругление углов
    accentColor?: string; // hex, акцентный цвет
    animationDuration?: number; // ms, скорость анимации
}

export interface ISectionLayoutProps {
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

export interface IBlockGridProps {
    layoutProps: IGridLayoutProps;
    layoutId?: string;
}

export interface IBlockFlexProps {
    layoutProps: IFlexLayoutProps;
    layoutId?: string;
}

export interface IBlockSectionProps {
    layoutProps: ISectionLayoutProps;
    layoutId?: string;
}

export interface IBlockSpaceProps {
    layoutProps: ISpaceProps;
}

export interface IBlockSliderProps {
    layoutProps: ISliderLayoutProps;
    layoutId?: string;
    slides?: IBricksComponent[];
    renderSlide?: (component: IBricksComponent) => VNodeChild;
    isEditor?: boolean;
}

export interface IBlockSliderCaptionsProps {
    captions: ISliderCaption[];
    activeIndex: number;
}

export interface IBlockSliderCaptionsEmits {
    select: [index: number];
}

export type TLayoutProps =
    | IGridLayoutProps
    | IFlexLayoutProps
    | ISpaceProps
    | ISliderLayoutProps
    | IAccordionLayoutProps
    | ISectionLayoutProps
    | IBlockSvgProps;
