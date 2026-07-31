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
        sidebarStore.showPropertiesPanel();
    },

    /**
     * Обновляет метаданные уже выбранного компонента, не трогая сам выбор.
     *
     * Нужно повтору загрузки библиотеки: свойства приезжают из манифеста, и
     * после его отказа открытая панель пуста, пока метаданные не доедут.
     * Повторный `selectComponent` для этого не годится — он ещё и открывает
     * панель свойств, то есть свернул бы её обратно тому, кто её закрыл.
     *
     * @param id - Компонент, для которого пришли метаданные.
     * @param properties - Определения редактируемых свойств.
     * @param description - Описание компонента.
     */
    setSelectedComponentMetadata(
        this: IComponentsStore,
        id: string,
        properties: ISelectedComponent['properties'],
        description?: ISelectedComponent['description']
    ) {
        // Пока метаданные ехали, пользователь мог выбрать другой компонент
        if (this.selectedComponent?.id !== id) {
            return;
        }

        this.selectedComponent = { id, properties, description };
    },

    /**
     * Сбрасывает выбор и скрывает правую панель свойств.
     */
    deselectComponent(this: IComponentsStore) {
        this.selectedComponent = null;
        this.interactivePreviewId = null;
        const sidebarStore = useSidebarStore();
        sidebarStore.hidePropertiesPanel();
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
