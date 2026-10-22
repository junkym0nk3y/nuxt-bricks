// #region Imports
// Types
import type { Component } from 'vue';

// Components
import BlockGrid from './components/BlockGrid.vue';
import BlockFlex from './components/BlockFlex.vue';
import BlockSection from './components/BlockSection.vue';
import BlockSpace from './components/BlockSpace.vue';
import BlockSlider from './components/BlockSlider.vue';
import BlockText from './components/BlockText.vue';
import BlockMedia from './components/BlockMedia.vue';
import BlockAccordion from './components/BlockAccordion.vue';
import BlockSvg from './components/BlockSvg.vue';
// #endregion

/**
 * Eager map of the canvas components of every layout block.
 * Bundle firewall: imported by the builder only — the canvas item
 * (BuilderCanvasItemLayout) and the library card preview (useComponentCardPreview).
 * The published bundle does not pull this map in, so the container blocks never end up
 * in it.
 */
export const CANVAS_BLOCK_COMPONENTS: Record<string, Component> = {
    Grid: BlockGrid,
    Flex: BlockFlex,
    Section: BlockSection,
    Space: BlockSpace,
    Slider: BlockSlider,
    Text: BlockText,
    Media: BlockMedia,
    Accordion: BlockAccordion,
    Svg: BlockSvg,
};
