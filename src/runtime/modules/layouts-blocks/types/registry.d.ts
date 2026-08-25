/**
 * Contracts of the layout block registry.
 * A definition describes a block as a whole: its library metadata, the panel
 * properties, the responsive mode and the escape hatches for the canvas and the
 * published render.
 */

import type { VNode, VNodeChild } from 'vue';
import type { IBricksComponent } from '../../common/types/brick';
import type { ILayoutProperty } from '../../common/types/layoutProperty';

/**
 * Translator handed to a block from the builder. It travels as a function rather
 * than an import: `layouts-blocks` renders on the published page too, where i18n is
 * not installed at all (it arrives with `features.builder`).
 */
export type TBlockTranslator = (key: string, params?: Record<string, unknown>) => string;

/** Render context of the published page (comes from TheRenderer) */
export interface IBlockRenderContext {
    component: IBricksComponent;
    /** Definition of the block being rendered — the defaults for resolvePublishedProps */
    definition: IBlockDefinition;
    extraClasses: string[];
    extraAttrs: Record<string, string | undefined>;
    styles: Record<string, string>; // CSS module
    renderChild: (child: IBricksComponent) => VNodeChild;
    getChildComponents: (c: IBricksComponent) => IBricksComponent[];
}

/** Binding context on the canvas (comes from BuilderCanvasItemLayout) */
export interface IBlockCanvasContext {
    component: IBricksComponent;
    layoutProps: Record<string, unknown>; // already resolved for the viewport
    boundProps: Record<string, unknown>; // componentBoundProps
    childComponents: IBricksComponent[];
    renderChild: (child: IBricksComponent) => VNodeChild; // slider slides
    /**
     * Translator of the builder. Blocks use it for the prompts an editor needs — an
     * empty accordion, an unpicked SVG — and pass nothing of the sort on the
     * published side, so a visitor sees an empty block rather than a prompt in the
     * language of whoever edited the page.
     */
    t: TBlockTranslator;
}

export interface IBlockDefinition {
    name: string; // 'Grid' — the componentName in the schema
    description: string;
    thumbnail: string; // module asset path 'images/layouts/grid.svg' (resolveBricksAssetUrl)
    isInteractive?: boolean;
    hasChildren?: boolean; // a container: children go in the default slot
    /** Panel properties */
    properties: ILayoutProperty[];
    /** Defaults outside properties (Media: muted/controls…, Svg: svgContent) */
    extraDefaults?: Record<string, unknown>;
    /** 'all' — every prop is device-scoped (Grid/Flex/Section/Space/Media/Svg) */
    responsiveMode: 'all' | 'none';
    /**
     * Localized starting content of a block dragged out of the library. Kept apart
     * from `properties[].default`, which is the structural default and must stay
     * language-neutral: a default travels into the page schema on the first save and
     * from that moment is the content of the person, not the interface — retranslating
     * it later would rewrite what they wrote.
     */
    seedProps?: (translate: TBlockTranslator) => Record<string, unknown>;
    /** Custom canvas binding; undefined = the generic layout props */
    canvasBind?: (ctx: IBlockCanvasContext) => Record<string, unknown>;
    /** Custom published render; undefined = the generic h(component, props) */
    renderPublished?: (ctx: IBlockRenderContext) => VNode;
    /** Generation of the responsive CSS vars */
    responsiveCssVars?: { prefix: string; vars: string[] };
}
