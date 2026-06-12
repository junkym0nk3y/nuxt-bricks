// #region Imports
// Types
import type { IDropZoneData, IDropEventData, IDropOptions } from '../types/draggable';
import type {
    IBricksComponent,
    IComponentLibraryItem,
    IComponentSlotDefinition,
} from '../../../common/types/brick';
import type { TBricksComponentsStore } from '../../core/stores/components';
import type { TComponentInsertPayload } from '../../core/stores/types';

// Vue
import { ref } from 'vue';
// #endregion

/**
 * Composable для управления перетаскиванием компонентов из библиотеки на canvas
 *
 * @returns Объект с состоянием и методами для drag-and-drop
 */
export function useComponentLibraryDrag() {
    // #region Data
    const draggedComponent = ref<IComponentLibraryItem | null>(null);
    // #endregion

    // #region Methods
    /**
     * Начинает перетаскивание компонента из библиотеки
     *
     * @param component - Компонент для перетаскивания
     * @param event - Событие drag start
     */
    function startDrag(component: IComponentLibraryItem, event: DragEvent): void {
        draggedComponent.value = component;
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'copy';
            event.dataTransfer.setData('application/json', JSON.stringify(component));
        }
    }

    /**
     * Извлекает данные из drop события
     *
     * @param event - Событие drop
     * @param options - Опции обработки drop
     * @returns Извлеченные данные события
     */
    function extractDropEventData(event: DragEvent, options?: IDropOptions): IDropEventData {
        const movedComponentId =
            event.dataTransfer?.getData('component-id') ||
            event.dataTransfer?.getData('text/plain') ||
            null;
        const rootTargetIndex =
            typeof options?.rootTargetIndex === 'number' ? options.rootTargetIndex : null;

        return { movedComponentId, rootTargetIndex };
    }

    /**
     * Определяет зоны сброса и проверяет на self-drop
     *
     * @param event - Событие drop
     * @param movedComponentId - ID перемещаемого компонента
     * @returns Данные о зонах сброса
     */
    function analyzeDropZones(event: DragEvent, movedComponentId: string | null): IDropZoneData {
        const target = event.target as HTMLElement | null;

        const layoutDropZone = target?.closest('[data-layout-drop-zone="true"]') as
            | (HTMLElement & { dataset: DOMStringMap })
            | null;

        const slotDropZone = target?.closest('[data-slot-drop-zone="true"]') as
            | (HTMLElement & { dataset: DOMStringMap })
            | null;

        const dropLayoutId = layoutDropZone?.dataset?.layoutId || null;

        const isSelfDrop =
            Boolean(layoutDropZone) &&
            Boolean(dropLayoutId) &&
            Boolean(movedComponentId) &&
            dropLayoutId === movedComponentId;

        return { layoutDropZone, slotDropZone, dropLayoutId, isSelfDrop };
    }

    /**
     * Проверяет, нужно ли прервать обработку drop
     *
     * @param dropZoneData - Данные о зонах сброса
     * @returns true, если нужно прервать обработку
     */
    function shouldAbortDrop(dropZoneData: IDropZoneData): boolean {
        // Прерываем если сброшено в slot zone (обрабатывается отдельно)
        if (dropZoneData.slotDropZone) {
            return true;
        }

        // Прерываем если сброшено в layout zone (обрабатывается layout компонентом)
        if (dropZoneData.layoutDropZone && !dropZoneData.isSelfDrop) {
            console.log('[useDraggableComponent] Dropped into layout, waiting for event...');
            return true;
        }

        // Прерываем если self-drop на layout
        if (dropZoneData.isSelfDrop) {
            console.log(
                '[useDraggableComponent] Ignoring self drop on layout:',
                dropZoneData.dropLayoutId
            );
            return true;
        }

        return false;
    }

    /**
     * Перемещает существующий компонент в root
     *
     * @param componentId - ID компонента для перемещения
     * @param store - Store с компонентами
     * @param rootTargetIndex - Целевой индекс в root
     */
    function moveExistingComponentToRoot(
        componentId: string,
        store: TBricksComponentsStore,
        rootTargetIndex: number | null
    ): void {
        console.log('[useDraggableComponent] Moving existing component:', componentId);

        const component = store.getComponentById(componentId);

        if (!component) {
            console.warn('[useDraggableComponent] Component not found in store:', componentId);
            return;
        }

        // Используем moveComponentToRoot если доступен
        if (typeof store.moveComponentToRoot === 'function') {
            store.moveComponentToRoot(componentId, rootTargetIndex, { skipHistory: true });
            console.log(
                '[useDraggableComponent] Root components after move:',
                store.getRootComponents()?.map((rootComp: IBricksComponent) => rootComp?.id) || []
            );
        } else if (component.parent) {
            // Fallback: удаляем из layout вручную
            store.removeChildFromLayout(component.parent, componentId, { skipHistory: true });
            component.parent = undefined;
        }

        // Сбрасываем grid позиционирование
        component.gridColumn = undefined;
        component.gridRow = undefined;

        // Сохраняем в историю
        if (typeof store.saveToHistory === 'function') {
            store.saveToHistory();
        }
    }

    /**
     * Создает данные компонента для добавления на canvas
     *
     * @param draggedComp - Перетаскиваемый компонент из библиотеки
     * @returns Данные компонента для store
     */
    function createComponentData(draggedComp: IComponentLibraryItem): TComponentInsertPayload {
        return {
            componentName: draggedComp.name,
            storyPath: draggedComp.storyPath,
            props: JSON.parse(JSON.stringify(draggedComp.defaultProps || {})),
            isInteractive: draggedComp.isInteractive || undefined,
            slots: Array.isArray(draggedComp.slots)
                ? draggedComp.slots.map((slot: IComponentSlotDefinition) => ({
                      name: slot.name,
                      label: slot.label,
                      description: slot.description,
                      allowMultiple: slot.allowMultiple,
                  }))
                : undefined,
        };
    }

    /**
     * Добавляет новый компонент на canvas
     *
     * @param store - Store с компонентами
     * @param rootTargetIndex - Целевой индекс в root
     */
    function addNewComponentToCanvas(
        store: TBricksComponentsStore,
        rootTargetIndex: number | null
    ): void {
        if (!draggedComponent.value) {
            console.warn('[useDraggableComponent] No dragged component found');
            return;
        }

        const componentData = createComponentData(draggedComponent.value);

        // Проверяем нужно ли контролировать историю вручную
        const shouldControlHistory =
            rootTargetIndex !== null && typeof store.moveComponentToRoot === 'function';

        // Добавляем компонент
        const id = store.addComponent(
            componentData,
            shouldControlHistory ? { skipHistory: true } : undefined
        );
        console.log('[useDraggableComponent] Component added with id:', id);

        // Перемещаем на нужную позицию если указан индекс
        if (id && rootTargetIndex !== null && typeof store.moveComponentToRoot === 'function') {
            store.moveComponentToRoot(id, rootTargetIndex, { skipHistory: true });
            if (typeof store.saveToHistory === 'function') {
                store.saveToHistory();
            }
        }
    }

    /**
     * Обрабатывает событие drop компонента на canvas
     *
     * @param event - Событие drop
     * @param canvasEl - Элемент canvas
     * @param store - Store с компонентами
     * @param options - Опции обработки drop
     */
    function handleDrop(
        event: DragEvent,
        canvasEl: HTMLElement,
        store: TBricksComponentsStore,
        options?: IDropOptions
    ): void {
        event.preventDefault();
        console.log('[useDraggableComponent] Drop event triggered', event);
        console.log('[useDraggableComponent] Dragged component:', draggedComponent.value);

        // Извлекаем данные события
        const { movedComponentId, rootTargetIndex } = extractDropEventData(event, options);

        // Анализируем зоны сброса
        const dropZoneData = analyzeDropZones(event, movedComponentId);

        // Проверяем нужно ли прервать обработку
        if (shouldAbortDrop(dropZoneData)) {
            return;
        }

        // Обрабатываем перемещение существующего компонента
        if (movedComponentId) {
            moveExistingComponentToRoot(movedComponentId, store, rootTargetIndex);
            draggedComponent.value = null;
            return;
        }

        // Обрабатываем добавление нового компонента
        addNewComponentToCanvas(store, rootTargetIndex);
        draggedComponent.value = null;
    }

    /**
     * Обрабатывает событие dragover для установки правильного dropEffect
     *
     * @param event - Событие dragover
     */
    function handleDragOver(event: DragEvent): void {
        event.preventDefault();
        if (event.dataTransfer) {
            if (event.dataTransfer.types.includes('component-id')) {
                event.dataTransfer.dropEffect = 'move';
            } else {
                event.dataTransfer.dropEffect = 'copy';
            }
        }
    }
    // #endregion

    return {
        draggedComponent,
        startDrag,
        handleDrop,
        handleDragOver,
    };
}
