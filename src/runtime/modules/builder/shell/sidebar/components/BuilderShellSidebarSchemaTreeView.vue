<script setup lang="ts">
// #region Imports
// Types
import type { IBricksComponent } from '../../../../common/types/brick';
import type { ISchemaTreeMoveRequest } from '../types/composables';
import type { ISidebarSchemaTreeViewEmits } from '../types/components';

// Vue
import { computed, nextTick } from 'vue';
import { until } from '@vueuse/core';
import { useI18n } from 'vue-i18n';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';
import { useCanvasStore } from '../../../core/stores/canvas';

// Constants
import { BASE_DEVICE_KEY } from '../../../../common/constants/devices';

// Composables
import { useComponentEditorMetadata } from '../../../core/composables/useComponentEditorMetadata';
import { useComponentMoveFeedback } from '../../../core/composables/useComponentMoveFeedback';

// Utils
import { scrollToComponentOnCanvas } from '../../../core/utils/scrollToComponent';

// Components
import BuilderShellSidebarSchemaTreeItem from './BuilderShellSidebarSchemaTreeItem.vue';
import BricksCloseButton from '../../../../ui/base/modal/BricksCloseButton.vue';
import BricksEmptyState from '../../../../ui/feedback/BricksEmptyState.vue';
// #endregion

// #region Emits
const emit = defineEmits<ISidebarSchemaTreeViewEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const componentsStore = useComponentsStore();
const canvasStore = useCanvasStore();
const { resolveComponentEditorMetadata } = useComponentEditorMetadata();
const { reportRefusedMove } = useComponentMoveFeedback();
// #endregion

// #region Computed
/**
 * Root components — the ones with no parent — the tree is built from.
 */
const rootComponents = computed<IBricksComponent[]>(() => componentsStore.getRootComponents());

const hasComponents = computed<boolean>(() => componentsStore.hasComponents);
// #endregion

// #region Methods
/**
 * Closes the schema panel.
 */
function handleClose(): void {
    emit('close');
}

/**
 * Performs the move a row resolved: the row knows its neighbors and its
 * destination, the controller owns the store call and the answer to the user.
 *
 * The refusal of the store is not swallowed: the rule was already asked while the
 * cursor was hovering, so a refusal here means the schema changed under the drag
 * — and a drop that does nothing without a word is exactly what the tree used to
 * do on every nested row.
 *
 * @param request - The dragged component, the destination and the index.
 */
function handleMove({ sourceId, destination, targetIndex }: ISchemaTreeMoveRequest): void {
    if (destination.kind === 'root') {
        componentsStore.moveComponentToRoot(sourceId, targetIndex);

        return;
    }

    const result = componentsStore.moveComponentToLayout(destination.parentId, sourceId, {
        targetIndex,
    });

    if (!result.moved) {
        reportRefusedMove(result.reason);
    }
}

/**
 * Switches the viewport to the first one the component is visible on, when the
 * current one does not show it. Does nothing while the component is visible where it
 * already is.
 *
 * @param component - Component whose visibility is checked.
 */
function ensureViewportForComponent(component: IBricksComponent): void {
    const currentViewport = canvasStore.viewport;
    const visibility = component.deviceVisibility;

    // No per-device restrictions at all means it is visible everywhere
    if (!visibility) {
        return;
    }

    const isVisibleOnCurrent = visibility[currentViewport] !== false;
    if (isVisibleOnCurrent) {
        return;
    }

    // Priority: the base device first, then the rest from the widest to the
    // narrowest — a wide sheet shows the block whole, so switching there tells the
    // user more
    const priority = [
        ...canvasStore.devices.filter((device) => device.key === BASE_DEVICE_KEY),
        ...[...canvasStore.devices].reverse().filter((device) => device.key !== BASE_DEVICE_KEY),
    ];

    const firstAvailable = priority.find((device) => visibility[device.key] !== false);
    if (firstAvailable) {
        canvasStore.setViewport(firstAvailable.key);
    }
}

/**
 * Selects the component, takes its properties from the metadata and opens the
 * properties panel. Switches the viewport when the component is invisible on the
 * current device, then scrolls to it.
 *
 * @param id - Id of the selected component.
 */
async function handleSelectComponent(id: string): Promise<void> {
    const component = componentsStore.getComponentById(id);
    if (!component) {
        return;
    }

    // 1. Switch the viewport when the component is invisible on the current one
    ensureViewportForComponent(component);

    // 2. Take the properties — through the same resolver a click on the canvas uses
    const { properties, description } = resolveComponentEditorMetadata(component);

    // 3. Select the component and open the properties panel
    componentsStore.selectComponent(id, properties, description);

    // 4. Scroll to the component on the canvas. In Figma mode the search is scoped to
    // the active viewport
    const scrollViewport =
        canvasStore.isFigmaMode && canvasStore.activeViewport
            ? canvasStore.activeViewport
            : undefined;

    // The scroll waits for the switch to actually be over — the flag the canvas store
    // holds while the sheet moves — and not for a duration of its own: a timer picked to
    // outlast the transition races it, and the sheet the scroll aims at is then still on
    // the move. Waiting on the flag also covers a switch started elsewhere (the bottom
    // bar), and resolves at once when nothing is switching
    await until(() => canvasStore.isViewportSwitching).toBe(false);
    await nextTick();
    scrollToComponentOnCanvas(id, scrollViewport);
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderShellSidebarSchemaTreeView">
        <div :class="$style.header">
            <h2 :class="$style.title">{{ t('bricks.schema.title') }}</h2>
            <BricksCloseButton @click="handleClose" />
        </div>

        <div :class="[$style.content, 'bricks-scrollbox']">
            <div v-if="hasComponents" :class="$style.tree">
                <BuilderShellSidebarSchemaTreeItem
                    v-for="component in rootComponents"
                    :key="component.id"
                    :component="component"
                    :depth="0"
                    @select="handleSelectComponent"
                    @move="handleMove"
                />
            </div>

            <BricksEmptyState
                v-else
                :class="$style.empty"
                size="sm"
                icon="ta:outline-drag-drop"
                :title="t('bricks.schema.empty')"
                :description="t('bricks.schema.emptyHint')"
            />
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderShellSidebarSchemaTreeView {
    overflow-y: auto;
    display: flex;
    flex: 1;
    flex-direction: column;
}

.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.6rem 2rem;
    border-bottom: 1px solid var(--bricks-base-300);
}

.title {
    margin: 0;
    font-size: 1.6rem;
    font-weight: 600;
    color: var(--bricks-base-900);
}

.content {
    overflow-y: auto;
    flex: 1;
    padding: 0.8rem;
}

.tree {
    display: flex;
    flex-direction: column;
}

.empty {
    height: 100%;
}
</style>
