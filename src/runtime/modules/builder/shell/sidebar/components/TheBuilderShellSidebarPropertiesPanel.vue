<script setup lang="ts">
// #region Imports
// Types
import type { IMediaItem } from '../../../../common/types/media';

// Vue
import { computed, ref } from 'vue';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';
import { useSidebarStore } from '../../../core/stores/sidebar';

// Components
import BuilderShellSidebarPropertiesView from './BuilderShellSidebarPropertiesView.vue';
// #endregion

// #region Emits
const emit = defineEmits<{
    openMediaGallery: [];
}>();
// #endregion

// #region Data
const componentsStore = useComponentsStore();
const sidebarStore = useSidebarStore();
const propertiesViewRef = ref<InstanceType<typeof BuilderShellSidebarPropertiesView> | null>(null);
// #endregion

// #region Computed
const isVisible = computed<boolean>(() => sidebarStore.right.visible);

const panelWidth = computed<string>(() => sidebarStore.right.width);
// #endregion

// #region Methods
/**
 * Closes the properties panel and drops the component selection.
 */
function handleClose(): void {
    componentsStore.deselectComponent();
}

/**
 * Forwards the request to open the media gallery upwards.
 */
function handleOpenMediaGallery(): void {
    emit('openMediaGallery');
}

/**
 * Hands the picked media item over to the nested properties view.
 *
 * @param item - Picked media item.
 */
function handleMediaSelect(item: IMediaItem): void {
    propertiesViewRef.value?.handleMediaSelect(item);
}

// Exposed for the composition root: it routes the media picked in the gallery here
defineExpose({
    handleMediaSelect,
});
// #endregion
</script>

<template>
    <Transition name="bricks-details-slide">
        <aside
            v-show="isVisible"
            :class="$style.TheBuilderShellSidebarPropertiesPanel"
            :style="{ width: panelWidth }"
        >
            <BuilderShellSidebarPropertiesView
                ref="propertiesViewRef"
                @close="handleClose"
                @open-media-gallery="handleOpenMediaGallery"
            />
        </aside>
    </Transition>
</template>

<style module lang="scss">
.TheBuilderShellSidebarPropertiesPanel {
    position: fixed;
    top: 6rem;
    right: 0;
    bottom: 0;
    z-index: 50;
    display: flex;
    background-color: var(--bricks-base-0);
    flex-direction: column;
    box-shadow: var(--bricks-shadow-md);
}
</style>
