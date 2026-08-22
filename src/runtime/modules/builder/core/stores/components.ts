import { defineStore } from 'pinia';
import type { IBricksComponent } from '../../../common/types/brick';
import { componentActions } from './componentActions';
import { loadFavoritesFromStorage } from './actions/favorites';
import type { IComponentsState, ISelectedComponentData } from './types';

/**
 * Owns the flat list of canvas components, their hierarchy and the selected one.
 * Every operation (CRUD, slots, history, selection) is proxied through the
 * aggregated set of actions.
 */
export const useComponentsStore = defineStore('bricksComponents', {
    state: (): IComponentsState => ({
        components: [],
        selectedComponent: null,
        clipboard: null,
        favorites: loadFavoritesFromStorage(),
        interactivePreviewId: null,
    }),

    getters: {
        /**
         * Returns a component by id, or `undefined` when there is no such component.
         *
         * @param _state - Store state (not read directly).
         */
        getComponentById(_state) {
            return (id: string) => {
                return this.components.find((component) => component.id === id);
            };
        },

        /**
         * Collects the extended data the properties panel needs about the selection.
         *
         * @param state - Current state carrying the selected component.
         * @returns The id, the component itself and the declarations of its editable
         * properties.
         */
        selectedComponentData(state): ISelectedComponentData | null {
            if (!state.selectedComponent) {
                return null;
            }

            const component = this.components.find(
                (item) => item.id === state.selectedComponent!.id
            );
            if (!component) {
                return null;
            }

            return {
                id: state.selectedComponent.id,
                component,
                properties: state.selectedComponent.properties,
                description: state.selectedComponent.description,
            };
        },

        /**
         * Returns a copy of the component list sorted by z-index, the order the render
         * needs.
         */
        sortedComponents(): IBricksComponent[] {
            return [...this.components].sort((a, b) => a.zIndex - b.zIndex);
        },

        /**
         * Whether the given id is the one currently selected.
         */
        isComponentSelected: (state) => (id: string) => state.selectedComponent?.id === id,

        /**
         * Whether a component is a favorite, by name.
         */
        isFavorite: (state) => (componentName: string) => state.favorites.includes(componentName),

        /**
         * Whether the canvas holds any components at all.
         */
        hasComponents(): boolean {
            return this.components.length > 0;
        },
    },

    actions: componentActions,
});

export type TBricksComponentsStore = ReturnType<typeof useComponentsStore>;
