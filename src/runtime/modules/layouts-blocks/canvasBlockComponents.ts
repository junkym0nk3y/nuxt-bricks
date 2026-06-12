// #region Imports
// Types
import type { Component } from 'vue';

// Components
import BlockGrid from './components/BlockGrid.vue';
import BlockFlex from './components/BlockFlex.vue';
import BlockSection from './components/BlockSection.vue';
import BlockSpace from './components/BlockSpace.vue';
import BlockSlider from './components/BlockSlider.vue';
import BlockTitle from './components/BlockTitle.vue';
import BlockText from './components/BlockText.vue';
import BlockMedia from './components/BlockMedia.vue';
import BlockAccordion from './components/BlockAccordion.vue';
import BlockSvg from './components/BlockSvg.vue';
// #endregion

/**
 * Eager-мапа канвасных компонентов всех layout-блоков.
 * Bundle firewall: импортируется ТОЛЬКО канвасом (BuilderCanvasItemLayout, шаг B4) —
 * published-бандл эту мапу не тянет, контейнерные блоки не попадают в него.
 */
export const CANVAS_BLOCK_COMPONENTS: Record<string, Component> = {
    Grid: BlockGrid,
    Flex: BlockFlex,
    Section: BlockSection,
    Space: BlockSpace,
    Slider: BlockSlider,
    Title: BlockTitle,
    Text: BlockText,
    Media: BlockMedia,
    Accordion: BlockAccordion,
    Svg: BlockSvg,
};
