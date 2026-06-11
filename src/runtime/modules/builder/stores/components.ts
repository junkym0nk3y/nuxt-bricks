import { defineStore } from 'pinia';
import type { LandingComponent } from '../../common/types/landing';
import { componentActions } from './componentActions';
import { loadFavoritesFromStorage } from './actions/favorites';
import type { IComponentsState, ISelectedComponentData } from './types';

/**
 * Отвечает за плоский список компонентов канваса, управление их иерархией и выбранным элементом.
 * Все операции (CRUD, слоты, история, выбор) проксируются через агрегированный набор действий.
 */
export const useComponentsStore = defineStore('landingComponents', {
    state: (): IComponentsState => ({
        components: [],
        selectedComponent: null,
        clipboard: null,
        favorites: loadFavoritesFromStorage(),
        interactivePreviewId: null,
    }),

    getters: {
        /**
         * Возвращает компонент по идентификатору или `undefined`, если элемент отсутствует.
         *
         * @param _state - Состояние стора (не используется напрямую).
         */
        getComponentById(_state) {
            return (id: string) => {
                return this.components.find((component) => component.id === id);
            };
        },

        /**
         * Собирает расширенные данные по выбранному компоненту для панели свойств.
         *
         * @param state - Текущее состояние с выбранным компонентом.
         * @returns Объект с id, самим компонентом и описанием editable-свойств.
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
         * Возвращает копию списка компонентов, отсортированную по z-index для корректного рендеринга.
         */
        sortedComponents(): LandingComponent[] {
            return [...this.components].sort((a, b) => a.zIndex - b.zIndex);
        },

        /**
         * Проверяет, соответствует ли переданный id текущему выбранному элементу.
         */
        isComponentSelected: (state) => (id: string) => state.selectedComponent?.id === id,

        /**
         * Проверяет, является ли компонент избранным по имени.
         */
        isFavorite: (state) => (componentName: string) => state.favorites.includes(componentName),

        /**
         * Указывает, есть ли вообще компоненты на канвасе.
         */
        hasComponents(): boolean {
            return this.components.length > 0;
        },
    },

    actions: componentActions,
});

export type LandingComponentsStore = ReturnType<typeof useComponentsStore>;
