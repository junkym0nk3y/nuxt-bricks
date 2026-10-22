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
/** Slot content of the schema is untrusted input: sanitizing it before v-html is mandatory */
const sanitizedSlotContent = computed<string>(() => sanitizeRichTextHtml(slotStringContent.value));
// #endregion

// #region Methods
/**
 * Builds the flow of a slot: its children and the insertion point as one keyed list for
 * TransitionGroup.
 *
 * @param slotName - Slot name of the component.
 * @param children - Children of the slot in display order.
 * @returns Flow entries to render.
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
