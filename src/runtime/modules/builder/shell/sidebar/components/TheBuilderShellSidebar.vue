<script setup lang="ts">
// #region Imports
// Types
import type { TSidebarView } from '../../../../common/types/brick';
import type { IMediaItem, TMediaGalleryContext } from '../../../../common/types/media';
import type { ISidebarProps, ISidebarEmits } from './types';

// Vue
import { computed, ref, watch } from 'vue';

// Pinia
import { useSidebarStore } from '../../../core/stores/sidebar';
import { usePublishStore } from '../../../publish/stores/publish';

// Components
import BuilderShellSidebarComponentsView from './BuilderShellSidebarComponentsView.vue';
import BuilderShellSidebarPublishView from './BuilderShellSidebarPublishView.vue';
import BuilderShellSidebarSchemaTreeView from './BuilderShellSidebarSchemaTreeView.vue';
// #endregion

// #region Props
const props = defineProps<ISidebarProps>();
// #endregion

// #region Emits
const emit = defineEmits<ISidebarEmits>();
// #endregion

// #region Data
const sidebarStore = useSidebarStore();
const publishStore = usePublishStore();
const publishViewRef = ref<InstanceType<typeof BuilderShellSidebarPublishView> | null>(null);
/** The panel has been opened at least once — its content is mounted from then on */
const hasBeenVisible = ref(sidebarStore.left.visible);
// #endregion

// #region Computed
const isVisible = computed<boolean>(() => sidebarStore.left.visible);
const activeView = computed(() => sidebarStore.activeView);

const sidebarWidth = computed<string>(() => sidebarStore.left.width);

/**
 * The view that is mounted. None of them until the panel is opened for the first time:
 * the panel hides through `v-show`, so its content would otherwise mount together with
 * the editor, and the library cards would render their previews and pull in the brick
 * modules with all of their Vue components and styles — with the panel closed all the
 * while.
 *
 * The latch never comes back off: closing the panel would unmount the list along with
 * its search and its scroll position, and a second opening loads nothing anew anyway.
 */
const mountedView = computed<TSidebarView | null>(() =>
    hasBeenVisible.value ? activeView.value : null
);
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
 * Forwards the request to load the library again upwards.
 */
function handleRetryLibrary(): void {
    emit('retryLibrary');
}

// Expose method for parent to call when media is selected from gallery
defineExpose({
    handleMediaSelect,
});
// #endregion

// #region Lifecycle
watch(isVisible, (visible) => {
    if (visible) {
        hasBeenVisible.value = true;
    }
});
// #endregion
</script>

<template>
    <Transition name="bricks-sidebar">
        <aside
            v-show="isVisible"
            :class="$style.TheBuilderShellSidebar"
            :style="{ width: sidebarWidth }"
        >
            <Transition name="bricks-sidebar-view" mode="out-in">
                <BuilderShellSidebarComponentsView
                    v-if="mountedView === 'components'"
                    key="components"
                    :components="props.components"
                    :skipped-bricks="props.skippedBricks"
                    :is-library-load-failed="props.isLibraryLoadFailed"
                    :is-library-loading="props.isLibraryLoading"
                    @close="handleCloseComponents"
                    @retry="handleRetryLibrary"
                />

                <BuilderShellSidebarPublishView
                    v-else-if="mountedView === 'publish'"
                    key="publish"
                    ref="publishViewRef"
                    @close="handleClosePublish"
                    @open-media-gallery="handleOpenMediaGallery"
                />

                <BuilderShellSidebarSchemaTreeView
                    v-else-if="mountedView === 'schema'"
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
    left: 5.4rem;
    z-index: 50;
    display: flex;
    border-right: 1px solid var(--bricks-base-300);
    background-color: var(--bricks-base-0);
    flex-direction: column;
    box-shadow: var(--bricks-shadow-md);
}
</style>
