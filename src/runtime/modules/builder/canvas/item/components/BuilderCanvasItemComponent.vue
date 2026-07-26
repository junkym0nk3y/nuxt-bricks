<script setup lang="ts">
// #region Imports
// Types
import type { ICanvasItemComponentProps } from '../../types/components';
import type { IBricksComponent } from '../../../../common/types/brick';
import type { TDropFlowEntry } from '../../../core/types/drag';

// Vue
import { computed } from 'vue';

// Composables
import { useComponentSlots } from '../composables/useComponentSlots';
import { useSlotDragDrop } from '../composables/useSlotDragDrop';

// Utils
import { sanitizeRichTextHtml } from '../../../../common/utils/sanitize/sanitizeRichText';
import { buildDropFlowEntries } from '../../../core/utils/dragVisuals';

// Components
import BuilderCanvasItem from './BuilderCanvasItem.vue';
import BuilderCanvasConditionalContainer from '../../viewport/components/BuilderCanvasConditionalContainer.vue';
import BuilderCanvasDropPlaceholder from '../../viewport/components/BuilderCanvasDropPlaceholder.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<ICanvasItemComponentProps>(), {});
// #endregion

// #region Data
const { slotRenderData, slotStringContent } = useComponentSlots(
    props.component.id,
    props.component.brickPath,
    false,
    props.component.props
);

const {
    getSlotDropIndex,
    setSlotContainerRef,
    handleSlotDragEnter,
    handleSlotDragOver,
    handleSlotDragLeave,
    handleSlotDrop,
} = useSlotDragDrop(props.component.id);
// #endregion

// #region Computed
/** Слот-контент схемы — недоверенный ввод: санитизация обязательна перед v-html. */
const sanitizedSlotContent = computed<string>(() => sanitizeRichTextHtml(slotStringContent.value));
// #endregion

// #region Methods
/**
 * Собирает поток слота: дети и место вставки одним keyed-списком для TransitionGroup.
 *
 * @param slotName - Имя слота компонента.
 * @param children - Дети слота в порядке отображения.
 * @returns Записи потока для рендера.
 */
function getSlotFlowEntries(slotName: string, children: IBricksComponent[]): TDropFlowEntry[] {
    return buildDropFlowEntries(children, getSlotDropIndex(slotName), `slot-drop-${slotName}`);
}
// #endregion
</script>

<template>
    <BuilderCanvasConditionalContainer :use-container="props.needsContainerWrapper">
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
                    <!-- Место вставки раздвигает детей слота; TransitionGroup сглаживает сдвиг -->
                    <TransitionGroup name="bricks-canvas-flow">
                        <template
                            v-for="entry in getSlotFlowEntries(
                                slotData.slot.name,
                                slotData.children
                            )"
                            :key="entry.key"
                        >
                            <BuilderCanvasDropPlaceholder v-if="entry.kind === 'placeholder'" />

                            <BuilderCanvasItem v-else :component="entry.component" />
                        </template>
                    </TransitionGroup>

                    <div
                        v-if="
                            slotData.children.length === 0 &&
                            getSlotDropIndex(slotData.slot.name) === null
                        "
                        :class="$style.slotSpacer"
                    />
                </div>
            </template>

            <template v-if="slotRenderData.length === 0 && sanitizedSlotContent" #default>
                <span v-html="sanitizedSlotContent"></span>
            </template>
        </component>
    </BuilderCanvasConditionalContainer>
</template>

<style module lang="scss">
.slotContainer {
    position: relative;
    display: flex;
    width: 100%;
    min-height: 0;
    flex-direction: column;
}

.slotSpacer {
    min-height: 1.6rem;
    pointer-events: none;
}
</style>
