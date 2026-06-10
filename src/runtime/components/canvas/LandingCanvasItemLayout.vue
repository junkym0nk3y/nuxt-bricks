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
} from '../../types/landing';

// Vue
import { h } from 'vue';

// Components
import LandingGrid from '../layouts/LandingGrid.vue';
import LandingFlex from '../layouts/LandingFlex.vue';
import LandingSection from '../layouts/LandingSection.vue';
import LandingSpace from '../layouts/LandingSpace.vue';
import LandingTitle from '../layouts/LandingTitle.vue';
import LandingText from '../layouts/LandingText.vue';
import LandingMedia from '../layouts/LandingMedia.vue';
import LandingSvg from '../layouts/LandingSvg.vue';
import LandingSlider from '../layouts/LandingSlider.vue';
import LandingAccordion from '../layouts/LandingAccordion.vue';
import LandingCanvasItem from './LandingCanvasItem.vue';
import ConditionalContainer from './ConditionalContainer.vue';
// #endregion

// #region Interfaces
/**
 * Пропсы для компонента LandingCanvasItemLayout
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
    h(LandingCanvasItem, {
        component: child,
        key: child.id,
    });
// #endregion
</script>

<template>
    <ConditionalContainer :use-container="props.needsContainerWrapper">
        <LandingGrid
            v-if="props.layoutName === 'grid'"
            :id="props.component.htmlId || undefined"
            :layout-props="props.layoutProps as GridLayoutProps"
            :layout-id="props.component.id"
            data-bricks-layout="grid"
        >
            <LandingCanvasItem
                v-for="child in props.childComponents"
                :key="child.id"
                :component="child"
            />
        </LandingGrid>

        <LandingFlex
            v-else-if="props.layoutName === 'flex'"
            :id="props.component.htmlId || undefined"
            :layout-props="props.layoutProps as FlexLayoutProps"
            :layout-id="props.component.id"
            data-bricks-layout="flex"
        >
            <LandingCanvasItem
                v-for="child in props.childComponents"
                :key="child.id"
                :component="child"
            />
        </LandingFlex>

        <LandingSection
            v-else-if="props.layoutName === 'section'"
            :id="props.component.htmlId || undefined"
            :layout-props="props.layoutProps as SectionLayoutProps"
            :layout-id="props.component.id"
            data-bricks-layout="section"
        >
            <LandingCanvasItem
                v-for="child in props.childComponents"
                :key="child.id"
                :component="child"
            />
        </LandingSection>

        <LandingSpace
            v-else-if="props.layoutName === 'space'"
            :id="props.component.htmlId || undefined"
            :layout-props="props.layoutProps as SpaceProps"
        />

        <LandingTitle
            v-else-if="props.layoutName === 'title'"
            :id="props.component.htmlId || undefined"
            :component-id="props.component.id"
            v-bind="props.componentBoundProps"
        />

        <LandingText
            v-else-if="props.layoutName === 'text'"
            :id="props.component.htmlId || undefined"
            :component-id="props.component.id"
            v-bind="props.componentBoundProps"
        />

        <LandingMedia
            v-else-if="props.layoutName === 'media'"
            :id="props.component.htmlId || undefined"
            v-bind="props.componentBoundProps"
            :width="(props.layoutProps as Record<string, string | number>).width"
            :height="(props.layoutProps as Record<string, string | number>).height"
            :border-radius="(props.layoutProps as Record<string, string | number>).borderRadius"
        />

        <LandingSlider
            v-else-if="props.layoutName === 'slider'"
            :id="props.component.htmlId || undefined"
            :layout-props="props.layoutProps as SliderLayoutProps"
            :layout-id="props.component.id"
            :slides="props.childComponents"
            :render-slide="renderLayoutChild"
            :is-editor="true"
        />

        <LandingSvg
            v-else-if="props.layoutName === 'svg'"
            :id="props.component.htmlId || undefined"
            :component-id="props.component.id"
            v-bind="props.componentBoundProps"
        />

        <LandingAccordion
            v-else-if="props.layoutName === 'accordion'"
            :id="props.component.htmlId || undefined"
            :layout-props="props.layoutProps as AccordionLayoutProps"
        />
    </ConditionalContainer>
</template>
