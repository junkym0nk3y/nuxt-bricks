<script setup lang="ts">
// #region Imports
// Types
import type { BricksComponent } from '../../../../common/types/brick';
import type { LayoutProps } from '../../../../layouts-blocks/types/blockProps';
import type { IBlockCanvasContext } from '../../../../layouts-blocks/types/registry';

// Utils
import { getBlockDefinition, resolveCanvasBind } from '../../../../layouts-blocks/registry';

// Vue
import { computed, h } from 'vue';

// Components
import { CANVAS_BLOCK_COMPONENTS } from '../../../../layouts-blocks/canvasBlockComponents';
import BuilderCanvasItem from './BuilderCanvasItem.vue';
import BuilderCanvasConditionalContainer from '../../viewport/components/BuilderCanvasConditionalContainer.vue';
// #endregion

// #region Interfaces
/**
 * Пропсы для компонента BuilderCanvasItemLayout
 */
interface ICanvasItemLayoutProps {
    /** Экземпляр компонента для рендеринга */
    component: BricksComponent;
    /** Имя типа layout в нижнем регистре (grid, flex, space, title, text, media) */
    layoutName: string;
    /** Специфичные пропсы layout-компонента */
    layoutProps: LayoutProps;
    /** Вычисленные пропсы для передачи в компонент (исключая внутренние) */
    componentBoundProps: Record<string, unknown>;
    /** Нужно ли оборачивать компонент в контейнер */
    needsContainerWrapper: boolean;
    /** Дочерние компоненты для layout-контейнеров */
    childComponents: BricksComponent[];
}
// #endregion

// #region Props
const props = defineProps<ICanvasItemLayoutProps>();
// #endregion

// #region Methods
const renderLayoutChild = (child: BricksComponent) =>
    h(BuilderCanvasItem, {
        component: child,
        key: child.id,
    });
// #endregion

// #region Computed
const blockDefinition = computed(() => getBlockDefinition(props.layoutName));

const blockComponent = computed(() => {
    const definition = blockDefinition.value;
    return definition ? CANVAS_BLOCK_COMPONENTS[definition.name] : undefined;
});

const canvasBindings = computed<Record<string, unknown>>(() => {
    const definition = blockDefinition.value;
    if (!definition) {
        return {};
    }

    const context: IBlockCanvasContext = {
        component: props.component,
        layoutProps: props.layoutProps as Record<string, unknown>,
        boundProps: props.componentBoundProps,
        childComponents: props.childComponents,
        renderChild: renderLayoutChild,
    };

    return {
        id: props.component.htmlId || undefined,
        ...resolveCanvasBind(definition, context),
    };
});
// #endregion
</script>

<template>
    <BuilderCanvasConditionalContainer :use-container="props.needsContainerWrapper">
        <component
            :is="blockComponent"
            v-if="blockComponent && blockDefinition"
            v-bind="canvasBindings"
        >
            <template v-if="blockDefinition.hasChildren">
                <BuilderCanvasItem
                    v-for="child in props.childComponents"
                    :key="child.id"
                    :component="child"
                />
            </template>
        </component>
    </BuilderCanvasConditionalContainer>
</template>
