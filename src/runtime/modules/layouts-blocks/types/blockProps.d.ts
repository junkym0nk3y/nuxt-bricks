/**
 * One breakpoint of Swiper: the geometry of the slides for a width range of the device
 * set. Both members travel together — the number of slides and the gap between them
 * decide one layout, and after hydration Swiper owns that layout completely.
 */
export interface ISliderBreakpoint {
    slidesPerView: number;
    spaceBetween: number;
}

/**
 * Props of the layout blocks (Grid/Flex/Space/Slider/Accordion/Section/Svg/Media).
 * The layouts-blocks domain owns these contracts; canvas/render/sidebar import them
 * from here.
 */

import type { ComputedRef, VNodeChild } from 'vue';
import type { TInlineEditingPropType } from '../../common/types/inlineEditing';
import type { IBricksComponent } from '../../common/types/brick';
import type { TBricksMediaLoadMode } from '../../common/types/config';

export type TGridLayoutVariant = 'default' | 'lead-left' | 'lead-right';

export type TGridRowHeight = 'auto' | '1fr' | 'min-content' | 'max-content';

export interface IGridLayoutProps {
    columns: number;
    rows?: number; // no less than 1
    gap: number;
    variant?: TGridLayoutVariant;
    rowHeight?: TGridRowHeight; // row height mode
    minRowHeight?: number; // minimum row height in rem
    paddingX?: number; // horizontal padding of the container in rem
    paddingY?: number; // vertical padding of the container in rem
}

export interface IFlexLayoutProps {
    direction: 'row' | 'column';
    justify: 'start' | 'center' | 'end' | 'space-between' | 'space-around';
    align: 'stretch' | 'start' | 'center' | 'end' | 'baseline';
    gap: number;
    wrap: boolean;
    paddingX?: number; // horizontal padding of the container in rem
    paddingY?: number; // vertical padding of the container in rem
}

export interface ISpaceProps {
    size: number; // rem; a string with a unit is not part of the contract (see normalizeSpaceSize)
    direction: 'vertical' | 'horizontal' | 'both';
    showDivider?: boolean;
    dividerColor?: string; // CSS color, default: var(--bricks-base-200)
    dividerWidth?: number; // px, default: 1
    dividerStyle?: 'solid' | 'dashed' | 'dotted';
    dividerMarginX?: number; // rem, margins on the sides
}

export interface ISliderCaption {
    text: string;
    subtitle?: string;
}

export interface ISliderLayoutProps {
    spaceBetween: number;
    /**
     * Number of slides on the base device. The former
     * `slidesPerViewDesktop/Tablet/Mobile` are gone: the set of devices is arbitrary,
     * and three separate props would describe neither a fourth step nor a key invented
     * by the user. The steps are set through `responsive[<key>]`.
     */
    slidesPerView: number;
    /** Property overrides keyed by the device keys of the page's set */
    responsive?: Record<string, Record<string, unknown>>;
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
    initialOpenIndex: number; // -1 = everything closed
    gap?: number; // rem, gap between items (0 = one solid block, >0 = card mode)
    borderRadius?: number; // rem, corner rounding
    accentColor?: string; // hex, accent color
    animationDuration?: number; // ms, animation speed
}

/**
 * Props of the Accordion block component (both surfaces bind them).
 */
export interface IBlockAccordionProps {
    layoutProps: IAccordionLayoutProps;
    /**
     * Prompt shown in place of an empty item list. An editor affordance: only the
     * canvas passes it, and a published page leaves the block empty instead of
     * showing a prompt in the language of the editor.
     */
    emptyLabel?: string;
}

export interface ISectionLayoutProps {
    backgroundColor?: string; // CSS color / CSS variable
    backgroundImage?: string; // URL of the background image
    paddingTop?: number; // rem
    paddingBottom?: number; // rem
    paddingX?: number; // rem
    maxWidth?: number; // rem, maximum width of the content area (0 = no limit)
    borderRadius?: number; // rem
    minHeight?: number; // rem, minimum height of the section
}

export interface IBlockSvgProps {
    componentId?: string;
    src?: string; // URL from the media gallery
    svgContent?: string; // Raw SVG content (filled in through svgContentProperty)
    color?: string; // CSS color — applied to fill/stroke
    width?: string | number; // rem or a CSS value
    height?: string | number; // rem or a CSS value
    alignment?: 'left' | 'center' | 'right';
    /**
     * Margins in rem, or a ready CSS value: the published render hands over the
     * per-device variable (`var(--bricks-svg-mt)`) the same way it does for the sizes,
     * and the value of the active step is picked by the generated rule.
     */
    marginTop?: string | number;
    marginBottom?: string | number;
    /**
     * Prompt shown in place of an unpicked SVG. An editor affordance: only the canvas
     * passes it, and a published page leaves the block empty instead of showing a
     * prompt in the language of the editor.
     */
    emptyLabel?: string;
}

export interface IBlockMediaProps {
    src?: string;
    alt?: string;
    type?: 'image' | 'video';
    objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
    width?: string | number;
    height?: string | number;
    borderRadius?: string | number;
    autoplay?: boolean;
    loop?: boolean;
    muted?: boolean;
    controls?: boolean;
    /**
     * URLs of the smaller variants used by progressive loading. Filled in when a
     * picture is chosen from the gallery (`previewUrlProperty` / `mockUrlProperty` in
     * the definition): the block stores the picture as a string rather than a media id,
     * so they cannot be derived from `src`.
     */
    previewSrc?: string;
    mockSrc?: string;
    /**
     * Pixel dimensions of the chosen picture. Filled in from the same place as the
     * variant addresses: they hold the space for the picture through `aspect-ratio`
     * while a transparent 1×1 sits in the markup. Zero (or absent) means the dimensions
     * are unknown, and then progressive loading falls back to the preview in the
     * markup.
     */
    naturalWidth?: number;
    naturalHeight?: number;
    /**
     * Progressive loading mode; `config` means take the global default from
     * `bricks.media.loadMode`. The mode is a property of the PLACE on the page, not of
     * the file: one and the same picture needs different treatment above the fold and
     * in the footer.
     */
    loadMode?: TBricksMediaLoadMode | 'config';
    /**
     * Above the fold: drops lazy and sets `fetchpriority="high"`. Progressive loading
     * above the fold hurts LCP — the full file is needed straight away.
     */
    eagerLoad?: boolean;
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
    /**
     * Whether some device limits the content width. `layoutProps` holds the value of the
     * drawn device alone, and the layout model of the section depends on all of them.
     */
    hasContentLimit?: boolean;
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

/**
 * Props of the Text block.
 *
 * `fontSize` is a responsive property: before the move to CSS variables the size was
 * set by `@container` queries right inside the SFC, but `container-type` is declared
 * on `.bricks-canvas` only, so on a published page the text always stayed at the base
 * size.
 */
export interface IBlockTextProps {
    componentId?: string;
    content?: string;
    fontSize?: number;
    marginTop?: string | number;
    marginBottom?: string | number;
}

/**
 * Inline editing context that the canvas passes down to the blocks through
 * provide/inject.
 */
export interface IInlineEditingContext {
    componentId: ComputedRef<string | null>;
    propName: ComputedRef<string | null>;
    propType: ComputedRef<TInlineEditingPropType | null>;
    isEditing: ComputedRef<boolean>;
}
