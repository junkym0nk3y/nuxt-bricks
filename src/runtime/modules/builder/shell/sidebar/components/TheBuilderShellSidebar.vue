<script setup lang="ts">
// #region Imports
// Types
import type { IComponentLibraryItem, IBricksSchema } from '../../../../common/types/brick';
import type { IMediaItem, TMediaGalleryContext } from '../../../../common/types/media';

// Vue
import { computed, ref } from 'vue';

// Pinia
import { useSidebarStore } from '../../../core/stores/sidebar';
import { usePublishStore } from '../../../publish/stores/publish';

// Components
import BuilderShellSidebarComponentsView from './BuilderShellSidebarComponentsView.vue';
import BuilderShellSidebarPublishView from './BuilderShellSidebarPublishView.vue';
import BuilderShellSidebarSchemaTreeView from './BuilderShellSidebarSchemaTreeView.vue';
// #endregion

// #region Props
const props = defineProps<{
    components: IComponentLibraryItem[];
}>();
// #endregion

// #region Emits
const emit = defineEmits<{
    openMediaGallery: [context: TMediaGalleryContext];
    importSchema: [schema: IBricksSchema];
}>();
// #endregion

// #region Data
const sidebarStore = useSidebarStore();
const publishStore = usePublishStore();
const publishViewRef = ref<InstanceType<typeof BuilderShellSidebarPublishView> | null>(null);
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
    const context: TMediaGalleryContext = activeView.value === 'publish' ? 'publish' : 'manager';
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
    }
}

/**
 * Пробрасывает импорт схемы из BuilderShellSidebarPublishView наверх.
 *
 * @param schema - Импортированная схема.
 */
function handleImportSchema(schema: IBricksSchema): void {
    emit('importSchema', schema);
}

// Expose method for parent to call when media is selected from gallery
defineExpose({
    handleMediaSelect,
});
// #endregion
</script>

<template>
    <Transition name="library-sidebar">
        <aside
            v-show="isVisible"
            :class="$style.TheBuilderShellSidebar"
            :style="{ width: sidebarWidth }"
        >
            <Transition name="library-sidebar-view" mode="out-in">
                <BuilderShellSidebarComponentsView
                    v-if="activeView === 'components'"
                    key="components"
                    :components="props.components"
                    @close="handleCloseComponents"
                />

                <BuilderShellSidebarPublishView
                    v-else-if="activeView === 'publish'"
                    key="publish"
                    ref="publishViewRef"
                    @close="handleClosePublish"
                    @open-media-gallery="handleOpenMediaGallery"
                    @import-schema="handleImportSchema"
                />

                <BuilderShellSidebarSchemaTreeView
                    v-else-if="activeView === 'schema'"
                    key="schema"
                    @close="handleCloseSchema"
                />
            </Transition>
        </aside>
    </Transition>
</template>

<style module lang="scss">
.TheBuilderShellSidebar {
    position: fixed;
    top: 6rem;
    bottom: 0;
    left: 4.8rem;
    z-index: 50;
    display: flex;
    border-right: 1px solid var(--bricks-base-300);
    background-color: var(--bricks-base-0);
    flex-direction: column;
    box-shadow: var(--shadow-md);
}
</style>
