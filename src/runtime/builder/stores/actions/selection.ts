import type { SelectedComponent } from '../../../common/types/landing';
import { useLandingSidebarStore } from '../sidebar';
import type { ILandingComponentsSelectionActions, ILandingComponentsStore } from '../types';

/**
 * Управляет выбором компонентов и синхронизацией с панелью свойств.
 */
export const selectionActions: ILandingComponentsSelectionActions = {
    /**
     * Помечает компонент выбранным и открывает панель свойств.
     *
     * @param id - Идентификатор выбранного элемента.
     * @param properties - Метаданные свойств из story-файла.
     */
    selectComponent(
        this: ILandingComponentsStore,
        id: string,
        properties: SelectedComponent['properties'] = [],
        description?: SelectedComponent['description']
    ) {
        const component = this.getComponentById(id);
        if (!component) {
            return;
        }

        // Сбрасываем интерактивный предпросмотр при переключении на другой компонент
        if (this.interactivePreviewId && this.interactivePreviewId !== id) {
            this.interactivePreviewId = null;
        }

        this.selectedComponent = {
            id,
            properties,
            description,
        };

        const sidebarStore = useLandingSidebarStore();
        sidebarStore.showSidebarView('properties');
    },

    /**
     * Сбрасывает выбор и возвращает сайдбар в список компонентов.
     */
    deselectComponent(this: ILandingComponentsStore) {
        this.selectedComponent = null;
        this.interactivePreviewId = null;
        const sidebarStore = useLandingSidebarStore();
        if (sidebarStore.activeView === 'properties') {
            sidebarStore.setActiveView('components');
        }
    },

    /**
     * Переключает режим интерактивного предпросмотра для компонента.
     * Если компонент уже в режиме preview — выключает его. Иначе — включает.
     *
     * @param id - Идентификатор компонента.
     */
    toggleInteractivePreview(this: ILandingComponentsStore, id: string) {
        this.interactivePreviewId = this.interactivePreviewId === id ? null : id;
    },
};
