<script setup lang="ts">
// #region Imports
// Types
import type { Component } from 'vue';
import type { LandingComponent } from '../../../common/types/landing';

// Composables
import { useComponentSlots } from '../../composables/useComponentSlots';
import { useSlotDragDrop } from '../../composables/useSlotDragDrop';

// Components
import CanvasItem from './CanvasItem.vue';
import CanvasConditionalContainer from './CanvasConditionalContainer.vue';
// #endregion

// #region Interfaces
/**
 * Пропсы для компонента CanvasItemComponent
 */
interface ICanvasItemComponentProps {
    /** Экземпляр landing-компонента для рендеринга */
    component: LandingComponent;
    /** Динамически загруженный экземпляр Vue-компонента */
    componentInstance: Component | null;
    /** Вычисленные пропсы для передачи в компонент (исключая внутренние) */
    componentBoundProps: Record<string, unknown>;
    /** Нужно ли оборачивать компонент в контейнер */
    needsContainerWrapper: boolean;
}
// #endregion

// #region Props
const props = defineProps<ICanvasItemComponentProps>();
// #endregion

// #region Data
const { slotRenderData, slotStringContent } = useComponentSlots(
    props.component.id,
    props.component.storyPath,
    false,
    props.component.props
);

const {
    getSlotIndicatorStyle,
    setSlotContainerRef,
    handleSlotDragEnter,
    handleSlotDragOver,
    handleSlotDragLeave,
    handleSlotDrop,
} = useSlotDragDrop(props.component.id);
// #endregion
</script>

<template>
    <CanvasConditionalContainer :use-container="props.needsContainerWrapper">
        <component :is="props.componentInstance" v-bind="props.componentBoundProps">
            <template
                v-for="slotData in slotRenderData"
                :key="slotData.slot.name"
                #[slotData.slot.name]
            >
                <div
                    :ref="setSlotContainerRef(slotData.slot.name)"
                    :class="$style.slotContainer"
                    data-slot-drop-zone="true"
                    :data-slot-name="slotData.slot.name"
                    draggable="false"
                    @dragenter="handleSlotDragEnter(slotData.slot.name, $event)"
                    @dragover="handleSlotDragOver(slotData.slot.name, $event)"
                    @dragleave="handleSlotDragLeave(slotData.slot.name, $event)"
                    @drop="handleSlotDrop(slotData.slot.name, $event)"
                >
                    <CanvasItem
                        v-for="child in slotData.children"
                        :key="child.id"
                        :component="child"
                    />

                    <div v-if="slotData.children.length === 0" :class="$style.slotSpacer"></div>

                    <div
                        :class="$style.slotIndicator"
                        data-slot-indicator="true"
                        :style="getSlotIndicatorStyle(slotData.slot.name)"
                    />
                </div>
            </template>

            <template v-if="slotRenderData.length === 0 && slotStringContent" #default>
                <span v-html="slotStringContent"></span>
            </template>
        </component>
    </CanvasConditionalContainer>
</template>

<style module lang="scss">
.slotContainer {
    position: relative;
    display: flex;
    width: 100%;
    min-height: 0;
    flex-direction: column;
}

.slotIndicator {
    position: absolute;
    right: 0;
    left: 0;
    height: 0.2rem;
    background-color: var(--bricks-primary);
    opacity: 0;
    transform: translateY(0);
    transition: opacity var(--default-transition);
    pointer-events: none;
}

.slotSpacer {
    min-height: 1.6rem;
    pointer-events: none;
}
</style>
