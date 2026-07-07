<script setup lang="ts">
// #region Imports
// Types
import type { ISidebarPropertySpacingEditorProps } from '../../types/sidebarProperties';

// Composables
import { useSpacingEditor } from '../../composables/useSpacingEditor';

// Components
import BuilderShellSidebarPropertySpacingEditorSide from './BuilderShellSidebarPropertySpacingEditorSide.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<ISidebarPropertySpacingEditorProps>(), {});
// #endregion

// #region Data
const {
    editingSide,
    editingValue,
    isMargin,
    contentLabel,
    topSlot,
    bottomSlot,
    leftSlot,
    rightSlot,
    handleStep,
    startEdit,
    commitEdit,
    cancelEdit,
} = useSpacingEditor(props);
// #endregion
</script>

<template>
    <div :class="[$style.BuilderShellSidebarPropertySpacingEditor, isMargin && $style._margin]">
        <div v-if="topSlot" :class="$style.edgeRow">
            <BuilderShellSidebarPropertySpacingEditorSide
                :item="topSlot"
                :is-editing="editingSide === 'top'"
                :editing-value="editingValue"
                @step="handleStep(topSlot, $event)"
                @start-edit="startEdit(topSlot)"
                @commit-edit="commitEdit(topSlot)"
                @cancel-edit="cancelEdit"
                @update:editing-value="editingValue = $event"
            />
        </div>

        <div :class="$style.middleRow">
            <div v-if="leftSlot" :class="$style.sideCell">
                <BuilderShellSidebarPropertySpacingEditorSide
                    :item="leftSlot"
                    vertical
                    :is-editing="editingSide === 'left'"
                    :editing-value="editingValue"
                    @step="handleStep(leftSlot, $event)"
                    @start-edit="startEdit(leftSlot)"
                    @commit-edit="commitEdit(leftSlot)"
                    @cancel-edit="cancelEdit"
                    @update:editing-value="editingValue = $event"
                />
            </div>

            <div :class="$style.contentBox">{{ contentLabel }}</div>

            <div v-if="rightSlot" :class="$style.sideCell">
                <BuilderShellSidebarPropertySpacingEditorSide :item="rightSlot" />
            </div>
        </div>

        <div v-if="bottomSlot" :class="$style.edgeRow">
            <BuilderShellSidebarPropertySpacingEditorSide
                :item="bottomSlot"
                :is-editing="editingSide === 'bottom'"
                :editing-value="editingValue"
                @step="handleStep(bottomSlot, $event)"
                @start-edit="startEdit(bottomSlot)"
                @commit-edit="commitEdit(bottomSlot)"
                @cancel-edit="cancelEdit"
                @update:editing-value="editingValue = $event"
            />
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderShellSidebarPropertySpacingEditor {
    display: flex;
    padding: 0.8rem;
    border-radius: 0.8rem;
    border: 1px solid var(--bricks-base-200);
    background-color: var(--bricks-base-0);
    flex-direction: column;
    gap: 0.6rem;

    &._margin {
        padding: 0;
        border-radius: 0;
        border: none;
        background: none;

        .contentBox {
            border: none;
            background-color: var(--bricks-base-100);
        }
    }
}

.edgeRow {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 2rem;
}

.middleRow {
    display: flex;
    align-items: stretch;
    gap: 0.6rem;
}

.sideCell {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 3.6rem;
    gap: 0.2rem;
}

.contentBox {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    min-height: 6.4rem;
    border-radius: 0.6rem;
    border: 1px dashed var(--bricks-base-300);
    font-size: 1.2rem;
    color: var(--bricks-base-500);
    user-select: none;
}
</style>
