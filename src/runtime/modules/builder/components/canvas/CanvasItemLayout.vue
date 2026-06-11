<script setup lang="ts">
// #region Imports
// Types
import type {
    LandingComponent,
    LayoutProps,
    GridLayoutProps,
    FlexLayoutProps,
    SpaceProps,
    SliderLayoutProps,
    AccordionLayoutProps,
    SectionLayoutProps,
} from '../../../common/types/landing';

// Vue
import { h } from 'vue';

// Components
import BlockGrid from '../../../layouts-blocks/components/BlockGrid.vue';
import BlockFlex from '../../../layouts-blocks/components/BlockFlex.vue';
import BlockSection from '../../../layouts-blocks/components/BlockSection.vue';
import BlockSpace from '../../../layouts-blocks/components/BlockSpace.vue';
import BlockTitle from '../../../layouts-blocks/components/BlockTitle.vue';
import BlockText from '../../../layouts-blocks/components/BlockText.vue';
import BlockMedia from '../../../layouts-blocks/components/BlockMedia.vue';
import BlockSvg from '../../../layouts-blocks/components/BlockSvg.vue';
import BlockSlider from '../../../layouts-blocks/components/BlockSlider.vue';
import BlockAccordion from '../../../layouts-blocks/components/BlockAccordion.vue';
import CanvasItem from './CanvasItem.vue';
import CanvasConditionalContainer from './CanvasConditionalContainer.vue';
// #endregion

// #region Interfaces
/**
 * Пропсы для компонента CanvasItemLayout
 */
interface ICanvasItemLayoutProps {
    /** Экземпляр landing-компонента для рендеринга */
    component: LandingComponent;
    /** Имя типа layout в нижнем регистре (grid, flex, space, title, text, media) */
    layoutName: string;
    /** Специфичные пропсы layout-компонента */
    layoutProps: LayoutProps;
    /** Вычисленные пропсы для передачи в компонент (исключая внутренние) */
    componentBoundProps: Record<string, unknown>;
    /** Нужно ли оборачивать компонент в контейнер */
    needsContainerWrapper: boolean;
    /** Дочерние компоненты для layout-контейнеров */
    childComponents: LandingComponent[];
}
// #endregion

// #region Props
const props = defineProps<ICanvasItemLayoutProps>();
// #endregion

// #region Methods
const renderLayoutChild = (child: LandingComponent) =>
    h(CanvasItem, {
        component: child,
        key: child.id,
    });
// #endregion
</script>

<template>
    <CanvasConditionalContainer :use-container="props.needsContainerWrapper">
        <BlockGrid
            v-if="props.layoutName === 'grid'"
            :id="props.component.htmlId || undefined"
            :layout-props="props.layoutProps as GridLayoutProps"
            :layout-id="props.component.id"
            data-bricks-layout="grid"
        >
            <CanvasItem
                v-for="child in props.childComponents"
                :key="child.id"
                :component="child"
            />
        </BlockGrid>

        <BlockFlex
            v-else-if="props.layoutName === 'flex'"
            :id="props.component.htmlId || undefined"
            :layout-props="props.layoutProps as FlexLayoutProps"
            :layout-id="props.component.id"
            data-bricks-layout="flex"
        >
            <CanvasItem
                v-for="child in props.childComponents"
                :key="child.id"
                :component="child"
            />
        </BlockFlex>

        <BlockSection
            v-else-if="props.layoutName === 'section'"
            :id="props.component.htmlId || undefined"
            :layout-props="props.layoutProps as SectionLayoutProps"
            :layout-id="props.component.id"
            data-bricks-layout="section"
        >
            <CanvasItem
                v-for="child in props.childComponents"
                :key="child.id"
                :component="child"
            />
        </BlockSection>

        <BlockSpace
            v-else-if="props.layoutName === 'space'"
            :id="props.component.htmlId || undefined"
            :layout-props="props.layoutProps as SpaceProps"
        />

        <BlockTitle
            v-else-if="props.layoutName === 'title'"
            :id="props.component.htmlId || undefined"
            :component-id="props.component.id"
            v-bind="props.componentBoundProps"
        />

        <BlockText
            v-else-if="props.layoutName === 'text'"
            :id="props.component.htmlId || undefined"
            :component-id="props.component.id"
            v-bind="props.componentBoundProps"
        />

        <BlockMedia
            v-else-if="props.layoutName === 'media'"
            :id="props.component.htmlId || undefined"
            v-bind="props.componentBoundProps"
            :width="(props.layoutProps as Record<string, string | number>).width"
            :height="(props.layoutProps as Record<string, string | number>).height"
            :border-radius="(props.layoutProps as Record<string, string | number>).borderRadius"
        />

        <BlockSlider
            v-else-if="props.layoutName === 'slider'"
            :id="props.component.htmlId || undefined"
            :layout-props="props.layoutProps as SliderLayoutProps"
            :layout-id="props.component.id"
            :slides="props.childComponents"
            :render-slide="renderLayoutChild"
            :is-editor="true"
        />

        <BlockSvg
            v-else-if="props.layoutName === 'svg'"
            :id="props.component.htmlId || undefined"
            :component-id="props.component.id"
            v-bind="props.componentBoundProps"
        />

        <BlockAccordion
            v-else-if="props.layoutName === 'accordion'"
            :id="props.component.htmlId || undefined"
            :layout-props="props.layoutProps as AccordionLayoutProps"
        />
    </CanvasConditionalContainer>
</template>
