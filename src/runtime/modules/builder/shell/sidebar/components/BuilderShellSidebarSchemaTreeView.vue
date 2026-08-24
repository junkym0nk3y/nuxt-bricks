<script setup lang="ts">
// #region Imports
// Types
import type { IBricksComponent } from '../../../../common/types/brick';

// Vue
import { computed, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';
import { useCanvasStore } from '../../../core/stores/canvas';

// Constants
import { BASE_DEVICE_KEY } from '../../../../common/constants/devices';

// Composables
import { useComponentEditorMetadata } from '../../../core/composables/useComponentEditorMetadata';

// Utils
import { scrollToComponentOnCanvas } from '../../../core/utils/scrollToComponent';

// Components
import BuilderShellSidebarSchemaTreeItem from './BuilderShellSidebarSchemaTreeItem.vue';
import BricksCloseButton from '../../../../ui/base/modal/BricksCloseButton.vue';
import BricksEmptyState from '../../../../ui/feedback/BricksEmptyState.vue';
// #endregion

// #region Emits
const emit = defineEmits<{
    close: [];
}>();
// #endregion

// #region Data
const { t } = useI18n();
const componentsStore = useComponentsStore();
const canvasStore = useCanvasStore();
const { resolveComponentEditorMetadata } = useComponentEditorMetadata();
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
 * Moves a component among the root ones according to the drop position.
 *
 * The target is always a root component: a nested row does not accept a drop (see
 * `canReceiveDrop` in the tree item). A nested block can still be dragged onto a
 * root row, and it is raised to the top level by this very call.
 *
 * @param draggedId - Id of the dragged component.
 * @param targetId - Id of the component it was dropped onto.
 * @param position - Position relative to the target: before or after.
 */
function handleReorder(draggedId: string, targetId: string, position: 'before' | 'after'): void {
    const rootComponents = componentsStore.getRootComponents();
    const targetIndex = rootComponents.findIndex((c) => c.id === targetId);

    if (targetIndex === -1) {
        return;
    }

    const newIndex = position === 'before' ? targetIndex : targetIndex + 1;
    componentsStore.moveComponentToRoot(draggedId, newIndex);
}

/**
 * Switches the viewport to the first one the component is visible on, when the
 * current one does not show it. Does nothing while the component is visible where it
 * already is.
 *
 * @param component - Component whose visibility is checked.
 * @returns True when the viewport was switched.
 */
function ensureViewportForComponent(component: IBricksComponent): boolean {
    const currentViewport = canvasStore.viewport;
    const visibility = component.deviceVisibility;

    // No per-device restrictions at all means it is visible everywhere
    if (!visibility) {
        return false;
    }

    const isVisibleOnCurrent = visibility[currentViewport] !== false;
    if (isVisibleOnCurrent) {
        return false;
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
        return true;
    }

    return false;
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
    const viewportSwitched = ensureViewportForComponent(component);

    // 2. Take the properties — through the same resolver a click on the canvas uses
    const { properties, description } = resolveComponentEditorMetadata(component);

    // 3. Select the component and open the properties panel
    componentsStore.selectComponent(id, properties, description);

    // 4. Scroll to the component on the canvas. In Figma mode the search is scoped to
    // the active viewport. After a viewport switch the scroll waits out the move of
    // the sheet first, otherwise it would aim at the old geometry
    const scrollViewport =
        canvasStore.isFigmaMode && canvasStore.activeViewport
            ? canvasStore.activeViewport
            : undefined;

    if (viewportSwitched) {
        setTimeout(async () => {
            await nextTick();
            scrollToComponentOnCanvas(id, scrollViewport);
        }, 450);
    } else {
        await nextTick();
        scrollToComponentOnCanvas(id, scrollViewport);
    }
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
                    v-for="(component, index) in rootComponents"
                    :key="component.id"
                    :component="component"
                    :depth="0"
                    :is-last="index === rootComponents.length - 1"
                    @select="handleSelectComponent"
                    @reorder="handleReorder"
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
