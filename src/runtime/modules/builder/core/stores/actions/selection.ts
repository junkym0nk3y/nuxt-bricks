import type { ISelectedComponent } from '../../../../common/types/brick';
import { useSidebarStore } from '../sidebar';
import type { IComponentsSelectionActions, IComponentsStore } from '../types';

/**
 * Управляет выбором компонентов и синхронизацией с панелью свойств.
 */
export const selectionActions: IComponentsSelectionActions = {
    /**
     * Помечает компонент выбранным и открывает панель свойств.
     *
     * @param id - Идентификатор выбранного элемента.
     * @param properties - Метаданные свойств из brick-файла.
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

        // Сбрасываем интерактивный предпросмотр при переключении на другой компонент
        if (this.interactivePreviewId && this.interactivePreviewId !== id) {
            this.interactivePreviewId = null;
        }

        this.selectedComponent = {
            id,
            properties,
            description,
        };

        const sidebarStore = useSidebarStore();
        sidebarStore.showSidebarView('properties');
    },

    /**
     * Сбрасывает выбор и возвращает сайдбар в список компонентов.
     */
    deselectComponent(this: IComponentsStore) {
        this.selectedComponent = null;
        this.interactivePreviewId = null;
        const sidebarStore = useSidebarStore();
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
    toggleInteractivePreview(this: IComponentsStore, id: string) {
        this.interactivePreviewId = this.interactivePreviewId === id ? null : id;
    },
};
