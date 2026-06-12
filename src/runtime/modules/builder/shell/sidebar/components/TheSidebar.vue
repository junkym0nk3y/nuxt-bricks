<script setup lang="ts">
// #region Imports
// Types
import type { ComponentLibraryItem, BricksSchema } from '../../../../common/types/brick';
import type { IMediaItem, TMediaGalleryContext } from '../../../../common/types/media';

// Vue
import { computed, ref } from 'vue';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';
import { useSidebarStore } from '../../../core/stores/sidebar';
import { usePublishStore } from '../../../publish/stores/publish';

// Components
import SidebarComponentsView from './SidebarComponentsView.vue';
import SidebarPropertiesView from './SidebarPropertiesView.vue';
import SidebarPublishView from './SidebarPublishView.vue';
import SidebarSchemaTreeView from './SidebarSchemaTreeView.vue';
// #endregion

// #region Props
const props = defineProps<{
    components: ComponentLibraryItem[];
}>();
// #endregion

// #region Emits
const emit = defineEmits<{
    openMediaGallery: [context: TMediaGalleryContext];
    importSchema: [schema: BricksSchema];
}>();
// #endregion

// #region Data
const componentsStore = useComponentsStore();
const sidebarStore = useSidebarStore();
const publishStore = usePublishStore();
const propertiesViewRef = ref<InstanceType<typeof SidebarPropertiesView> | null>(null);
const publishViewRef = ref<InstanceType<typeof SidebarPublishView> | null>(null);
// #endregion

// #region Computed
const isVisible = computed<boolean>(() => sidebarStore.left.visible);
const activeView = computed(() => sidebarStore.activeView);

const sidebarWidth = computed<string>(() => sidebarStore.left.width);
// #endregion

// #region Methods
/**
 * Closes the sidebar entirely.
 */
function handleCloseComponents(): void {
    sidebarStore.hideSidebar();
}

/**
 * Closes the properties view and resets the selection.
 */
function handleCloseProperties(): void {
    // Reset selection without changing activeView to avoid transition conflicts
    componentsStore.selectedComponent = null;
    sidebarStore.hideSidebar();
}

/**
 * Closes the publish settings view.
 */
function handleClosePublish(): void {
    publishStore.clearErrors();
    sidebarStore.hideSidebar();
}

/**
 * Closes the schema tree view.
 */
function handleCloseSchema(): void {
    sidebarStore.hideSidebar();
}

/**
 * Opens media gallery modal.
 */
function handleOpenMediaGallery(): void {
    const context: TMediaGalleryContext =
        activeView.value === 'properties'
            ? 'properties'
            : activeView.value === 'publish'
              ? 'publish'
              : 'manager';
    emit('openMediaGallery', context);
}

/**
 * Handles media selection from gallery modal.
 *
 * @param item - Selected media item
 */
function handleMediaSelect(item: IMediaItem): void {
    if (activeView.value === 'publish') {
        publishViewRef.value?.handleMediaSelect(item);
        return;
    }

    propertiesViewRef.value?.handleMediaSelect(item);
}

/**
 * Пробрасывает импорт схемы из SidebarPublishView наверх.
 *
 * @param schema - Импортированная схема.
 */
function handleImportSchema(schema: BricksSchema): void {
    emit('importSchema', schema);
}

// Expose method for parent to call when media is selected from gallery
defineExpose({
    handleMediaSelect,
});
// #endregion
</script>

<template>
    <Transition name="sidebar-slide">
        <aside v-show="isVisible" :class="$style.TheSidebar" :style="{ width: sidebarWidth }">
            <Transition name="library-sidebar-view" mode="out-in">
                <SidebarComponentsView
                    v-if="activeView === 'components'"
                    key="components"
                    :components="props.components"
                    @close="handleCloseComponents"
                />

                <SidebarPropertiesView
                    v-else-if="activeView === 'properties'"
                    key="properties"
                    ref="propertiesViewRef"
                    @close="handleCloseProperties"
                    @open-media-gallery="handleOpenMediaGallery"
                />

                <SidebarPublishView
                    v-else-if="activeView === 'publish'"
                    key="publish"
                    ref="publishViewRef"
                    @close="handleClosePublish"
                    @open-media-gallery="handleOpenMediaGallery"
                    @import-schema="handleImportSchema"
                />

                <SidebarSchemaTreeView
                    v-else-if="activeView === 'schema'"
                    key="schema"
                    @close="handleCloseSchema"
                />
            </Transition>
        </aside>
    </Transition>
</template>

<style module lang="scss">
.TheSidebar {
    position: fixed;
    top: 6rem;
    bottom: 0;
    left: 7.2rem;
    z-index: 50;
    display: flex;
    border-right: 1px solid var(--bricks-base-300);
    background-color: var(--bricks-base-0);
    flex-direction: column;
    box-shadow: var(--shadow-md);
}
</style>

<style lang="scss">
// Transition для появления/исчезновения всего sidebar
.sidebar-slide-enter-active,
.sidebar-slide-leave-active {
    transition:
        transform 300ms cubic-bezier(0.4, 0, 0.2, 1),
        opacity 250ms cubic-bezier(0.4, 0, 0.2, 1);
}

.sidebar-slide-enter-from {
    opacity: 0;
    transform: translateX(-100%);
}

.sidebar-slide-leave-to {
    opacity: 0;
    transform: translateX(-100%);
}
</style>
