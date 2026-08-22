import type { ISelectedComponent } from '../../../../common/types/brick';
import { useSidebarStore } from '../sidebar';
import type { IComponentsSelectionActions, IComponentsStore } from '../types';

/**
 * Owns the component selection and keeps the properties panel in step with it.
 */
export const selectionActions: IComponentsSelectionActions = {
    /**
     * Marks a component as selected and opens the properties panel.
     *
     * @param id - Id of the selected element.
     * @param properties - Definitions of the editable properties: for a brick component
     * they come from the manifest, for a layout block from its definition.
     */
    selectComponent(
        this: IComponentsStore,
        id: string,
        properties: ISelectedComponent['properties'] = [],
        description?: ISelectedComponent['description']
    ) {
        const component = this.getComponentById(id);
        if (!component) {
            return;
        }

        // Switching to another component drops the interactive preview
        if (this.interactivePreviewId && this.interactivePreviewId !== id) {
            this.interactivePreviewId = null;
        }

        this.selectedComponent = {
            id,
            properties,
            description,
        };

        const sidebarStore = useSidebarStore();
        sidebarStore.showPropertiesPanel();
    },

    /**
     * Updates the metadata of the already selected component without touching the
     * selection itself.
     *
     * Retrying the library load needs this: the properties arrive with the manifest,
     * and after the manifest has failed the open panel stays empty until they get
     * there. Calling `selectComponent` again is no good for that — it also opens the
     * properties panel, so it would reopen one that the user had just closed.
     *
     * @param id - Component the metadata arrived for.
     * @param properties - Definitions of the editable properties.
     * @param description - Description of the component.
     */
    setSelectedComponentMetadata(
        this: IComponentsStore,
        id: string,
        properties: ISelectedComponent['properties'],
        description?: ISelectedComponent['description']
    ) {
        // While the metadata was on its way, the user may have selected another component
        if (this.selectedComponent?.id !== id) {
            return;
        }

        this.selectedComponent = { id, properties, description };
    },

    /**
     * Clears the selection and hides the right properties panel.
     */
    deselectComponent(this: IComponentsStore) {
        this.selectedComponent = null;
        this.interactivePreviewId = null;
        const sidebarStore = useSidebarStore();
        sidebarStore.hidePropertiesPanel();
    },

    /**
     * Toggles the interactive preview of a component: a component already in preview
     * leaves it, any other one enters it.
     *
     * @param id - Id of the component.
     */
    toggleInteractivePreview(this: IComponentsStore, id: string) {
        this.interactivePreviewId = this.interactivePreviewId === id ? null : id;
    },
};
