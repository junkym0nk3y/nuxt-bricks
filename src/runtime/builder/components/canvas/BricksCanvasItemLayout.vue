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
} from '../../../types/landing';

// Vue
import { h } from 'vue';

// Components
import BricksGrid from '../../../layouts-blocks/components/BricksGrid.vue';
import BricksFlex from '../../../layouts-blocks/components/BricksFlex.vue';
import BricksSection from '../../../layouts-blocks/components/BricksSection.vue';
import BricksSpace from '../../../layouts-blocks/components/BricksSpace.vue';
import BricksTitle from '../../../layouts-blocks/components/BricksTitle.vue';
import BricksText from '../../../layouts-blocks/components/BricksText.vue';
import BricksMedia from '../../../layouts-blocks/components/BricksMedia.vue';
import BricksSvg from '../../../layouts-blocks/components/BricksSvg.vue';
import BricksSlider from '../../../layouts-blocks/components/BricksSlider.vue';
import BricksAccordion from '../../../layouts-blocks/components/BricksAccordion.vue';
import BricksCanvasItem from './BricksCanvasItem.vue';
import ConditionalContainer from './ConditionalContainer.vue';
// #endregion

// #region Interfaces
/**
 * Пропсы для компонента BricksCanvasItemLayout
 */
interface ILandingCanvasItemLayoutProps {
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
const props = defineProps<ILandingCanvasItemLayoutProps>();
// #endregion

// #region Methods
const renderLayoutChild = (child: LandingComponent) =>
    h(BricksCanvasItem, {
        component: child,
        key: child.id,
    });
// #endregion
</script>

<template>
    <ConditionalContainer :use-container="props.needsContainerWrapper">
        <BricksGrid
            v-if="props.layoutName === 'grid'"
            :id="props.component.htmlId || undefined"
            :layout-props="props.layoutProps as GridLayoutProps"
            :layout-id="props.component.id"
            data-bricks-layout="grid"
        >
            <BricksCanvasItem
                v-for="child in props.childComponents"
                :key="child.id"
                :component="child"
            />
        </BricksGrid>

        <BricksFlex
            v-else-if="props.layoutName === 'flex'"
            :id="props.component.htmlId || undefined"
            :layout-props="props.layoutProps as FlexLayoutProps"
            :layout-id="props.component.id"
            data-bricks-layout="flex"
        >
            <BricksCanvasItem
                v-for="child in props.childComponents"
                :key="child.id"
                :component="child"
            />
        </BricksFlex>

        <BricksSection
            v-else-if="props.layoutName === 'section'"
            :id="props.component.htmlId || undefined"
            :layout-props="props.layoutProps as SectionLayoutProps"
            :layout-id="props.component.id"
            data-bricks-layout="section"
        >
            <BricksCanvasItem
                v-for="child in props.childComponents"
                :key="child.id"
                :component="child"
            />
        </BricksSection>

        <BricksSpace
            v-else-if="props.layoutName === 'space'"
            :id="props.component.htmlId || undefined"
            :layout-props="props.layoutProps as SpaceProps"
        />

        <BricksTitle
            v-else-if="props.layoutName === 'title'"
            :id="props.component.htmlId || undefined"
            :component-id="props.component.id"
            v-bind="props.componentBoundProps"
        />

        <BricksText
            v-else-if="props.layoutName === 'text'"
            :id="props.component.htmlId || undefined"
            :component-id="props.component.id"
            v-bind="props.componentBoundProps"
        />

        <BricksMedia
            v-else-if="props.layoutName === 'media'"
            :id="props.component.htmlId || undefined"
            v-bind="props.componentBoundProps"
            :width="(props.layoutProps as Record<string, string | number>).width"
            :height="(props.layoutProps as Record<string, string | number>).height"
            :border-radius="(props.layoutProps as Record<string, string | number>).borderRadius"
        />

        <BricksSlider
            v-else-if="props.layoutName === 'slider'"
            :id="props.component.htmlId || undefined"
            :layout-props="props.layoutProps as SliderLayoutProps"
            :layout-id="props.component.id"
            :slides="props.childComponents"
            :render-slide="renderLayoutChild"
            :is-editor="true"
        />

        <BricksSvg
            v-else-if="props.layoutName === 'svg'"
            :id="props.component.htmlId || undefined"
            :component-id="props.component.id"
            v-bind="props.componentBoundProps"
        />

        <BricksAccordion
            v-else-if="props.layoutName === 'accordion'"
            :id="props.component.htmlId || undefined"
            :layout-props="props.layoutProps as AccordionLayoutProps"
        />
    </ConditionalContainer>
</template>
