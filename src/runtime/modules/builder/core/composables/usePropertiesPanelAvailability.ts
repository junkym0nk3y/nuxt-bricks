// #region Imports
// Vue
import { watch, type Ref } from 'vue';

// Pinia
import { useSidebarStore } from '../stores/sidebar';
// #endregion

/**
 * Keeps the sidebar store aware of whether the right-hand properties panel mounts.
 *
 * What the store does with the flag, and why `right.visible` would otherwise lie, is
 * at `sidebar.setPropertiesPanelAvailable`.
 *
 * A watcher rather than a single call: in builds without SSR the role arrives by
 * request after the first frame, which means the permission can be taken away from an
 * already open panel.
 *
 * @param canEdit - Edit permission of the current role.
 */
export function usePropertiesPanelAvailability(canEdit: Ref<boolean>): void {
    const sidebarStore = useSidebarStore();

    watch(
        canEdit,
        (isEditable) => {
            sidebarStore.setPropertiesPanelAvailable(isEditable);
        },
        { immediate: true }
    );
}
