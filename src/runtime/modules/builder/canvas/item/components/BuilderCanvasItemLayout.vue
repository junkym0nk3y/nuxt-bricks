<script setup lang="ts">
// #region Imports
// Types
import type { IBricksComponent } from '../../../../common/types/brick';
import type { TLayoutProps } from '../../../../layouts-blocks/types/blockProps';
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
 * Props of the BuilderCanvasItemLayout component
 */
interface ICanvasItemLayoutProps {
    /** Component instance to render */
    component: IBricksComponent;
    /** Lower-cased name of the block, as the registry knows it (grid, flex, section, …) */
    layoutName: string;
    /** Props specific to the layout component */
    layoutProps: TLayoutProps;
    /** Resolved props to pass into the component (internal ones excluded) */
    componentBoundProps: Record<string, unknown>;
    /** Whether the component has to be wrapped in a container */
    needsContainerWrapper: boolean;
    /** Child components for layout containers */
    childComponents: IBricksComponent[];
}
// #endregion

// #region Props
const props = defineProps<ICanvasItemLayoutProps>();
// #endregion

// #region Methods
const renderLayoutChild = (child: IBricksComponent) =>
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
