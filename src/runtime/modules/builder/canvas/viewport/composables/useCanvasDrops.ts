// #region Imports
// Types
import type { IComponentSlotDefinition, TCanvasDragSource } from '../../../../common/types/brick';
import type { ICanvasDropsOptions, ILayoutDropDetail, ISlotDropDetail } from '../../types/canvas';

// Vue
import { computed, ref, watch } from 'vue';

// Pinia
import { useCanvasStore } from '../../../core/stores/canvas';

// Utils
import { applyDropEffect } from '../../../../common/utils/dragAndDrop';
import { suspendCanvasFlowTransitions } from '../../../core/utils/canvasFlow';
// #endregion

/**
 * Собирает всю drag & drop-логику корневой области канваса в одном месте.
 *
 * @param options - Параметры, необходимые для работы обработчиков.
 */
export function useCanvasDrops({
    dragComposable,
    componentsStore,
    canvasRef,
    containerRef,
}: ICanvasDropsOptions) {
    const canvasStore = useCanvasStore();
    /** Индекс будущей вставки в root: он же позиция flow-плейсхолдера в шаблоне. */
    const rootDropIndex = ref<number | null>(null);
    const rootDragDepth = ref(0);

    /**
     * Попадёт ли будущий root-блок внутрь `.bricks-container`: контейнер отключает
     * только `fullWidth`, поэтому место вставки должно повторять его геометрию
     * (max-width + aside-отступы), а не всю ширину канваса.
     *
     * Новый блок из библиотеки всегда создаётся без `fullWidth`; существующий
     * сохраняет своё значение при переносе в корень.
     */
    const isRootPlaceholderContained = computed<boolean>(() => {
        const { source, componentId } = canvasStore.dragState;

        if (source === 'canvas' && componentId) {
            return componentsStore.getComponentById(componentId)?.fullWidth !== true;
        }

        return true;
    });

    /**
     * Отключает анимацию сдвига потока на время применения drop.
     *
     * Место под блок уже раздвинуто плейсхолдером, поэтому FLIP на этом патче
     * рисовал бы «доезд» блока к позиции после отпускания курсора.
     */
    function commitFlowInstantly(): void {
        suspendCanvasFlowTransitions(canvasRef.value);
    }

    /**
     * Обрабатывает drop по корневой области канваса и передает данные drag-композиблу.
     *
     * @param event - Нативное drop-событие браузера.
     */
    function handleCanvasDrop(event: DragEvent): void {
        if (canvasRef.value && dragComposable?.handleDrop) {
            updateRootDropPlaceholder(event);
            commitFlowInstantly();

            dragComposable.handleDrop(event, canvasRef.value, componentsStore, {
                rootTargetIndex: rootDropIndex.value,
            });

            resetRootDropPlaceholder();
            // Drop-сессия закончена независимо от того, приняла ли зона payload:
            // без этого исходное место оставалось схлопнутым до `dragend`, который
            // браузер присылает на кадр-два позже — блок «возвращался» с задержкой.
            finishDrag();
        }
    }

    /**
     * Делегирует событие dragover активному drag-композиблу.
     *
     * @param event - Нативное dragover-событие.
     */
    function handleCanvasDragOver(event: DragEvent): void {
        dragComposable?.handleDragOver?.(event);
    }

    /**
     * Проверяет, можно ли обрабатывать drag-событие как корневое.
     *
     * @param event - Текущее drag-событие.
     * @returns Нужно ли обрабатывать событие на корневом уровне.
     */
    function shouldHandleRootDrag(event: DragEvent): boolean {
        const container = containerRef.value;
        if (!container) {
            return false;
        }

        const target = event.target as HTMLElement | null;
        if (!target) {
            return false;
        }

        const layoutDropZone = target.closest('[data-layout-drop-zone="true"]');
        const slotDropZone = target.closest('[data-slot-drop-zone="true"]');
        if (slotDropZone) {
            return false;
        }
        if (layoutDropZone && layoutDropZone !== container) {
            return false;
        }

        return true;
    }

    /**
     * Сбрасывает позицию плейсхолдера и глубину drag-событий на корне.
     */
    function resetRootDropPlaceholder(): void {
        rootDropIndex.value = null;
        rootDragDepth.value = 0;
    }

    /**
     * Убирает корневой transient-плейсхолдер при окончании или отмене drag.
     *
     * @param source - Текущий источник drag-сессии.
     */
    function handleDragSourceChange(source: TCanvasDragSource | null): void {
        if (source === null) {
            resetRootDropPlaceholder();
        }
    }

    watch(() => canvasStore.dragState.source, handleDragSourceChange, { flush: 'sync' });

    /**
     * Обрабатывает вход курсора в корневую drop-зону.
     *
     * @param event - Drag-событие при входе указателя.
     */
    function handleRootDragEnter(event: DragEvent): void {
        if (!shouldHandleRootDrag(event)) {
            return;
        }

        event.preventDefault();
        rootDragDepth.value += 1;
        updateRootDropPlaceholder(event);
    }

    /**
     * Пересчитывает индикатор при перемещении курсора внутри drop-зоны.
     *
     * @param event - Текущее dragover-событие.
     */
    function handleRootDragOver(event: DragEvent): void {
        if (!shouldHandleRootDrag(event)) {
            resetRootDropPlaceholder();
            return;
        }

        event.preventDefault();
        updateRootDropPlaceholder(event);
    }

    /**
     * Завершает обработку drop-зоны при выходе курсора.
     *
     * @param event - Drag-событие при выходе указателя.
     */
    function handleRootDragLeave(event: DragEvent): void {
        if (!shouldHandleRootDrag(event)) {
            return;
        }

        event.preventDefault();
        rootDragDepth.value = Math.max(0, rootDragDepth.value - 1);
        if (rootDragDepth.value === 0) {
            resetRootDropPlaceholder();
        }
    }

    /**
     * Пересчитывает индекс вставки корневой drop-зоны по позиции курсора.
     *
     * @param event - Текущее dragover-событие.
     */
    function updateRootDropPlaceholder(event: DragEvent): void {
        const container = containerRef.value;
        if (!container) {
            return;
        }

        if (!shouldHandleRootDrag(event) || !applyDropEffect(event)) {
            resetRootDropPlaceholder();
            return;
        }

        const children = Array.from(
            container.querySelectorAll<HTMLElement>(':scope > [data-layout-drop-item="true"]')
        );
        const pointerY = event.clientY;
        const hoveredIndex = children.findIndex((child) => {
            const childRect = child.getBoundingClientRect();
            return pointerY < childRect.top + childRect.height / 2;
        });

        rootDropIndex.value = hoveredIndex === -1 ? children.length : hoveredIndex;
    }

    /**
     * Завершает успешную drag-сессию после мутации store.
     */
    function finishDrag(): void {
        dragComposable?.endDrag();
        canvasStore.finishCanvasDrag();
    }

    /**
     * Обрабатывает кастомное событие `layout-drop` от дочерних layout-компонентов.
     *
     * @param event - Событие layout-компонента.
     */
    function handleLayoutDrop(event: CustomEvent): void {
        resetRootDropPlaceholder();
        commitFlowInstantly();
        const detail = event.detail as ILayoutDropDetail;
        const { movedComponentId } = detail;

        if (detail.layoutId && movedComponentId && detail.layoutId === movedComponentId) {
            console.warn('[TheBuilderCanvas] Ignoring layout drop on self', detail);
            return;
        }

        if (movedComponentId) {
            moveExistingComponent(detail);
            finishDrag();
            return;
        }

        addComponentFromLibrary(detail);
        finishDrag();
    }

    /**
     * Переносит существующий компонент в указанный layout.
     *
     * @param layoutDropDetail - Параметры перемещения.
     */
    function moveExistingComponent({
        layoutId,
        movedComponentId,
        gridColumn,
        gridRow,
        targetIndex,
        swap,
    }: ILayoutDropDetail): void {
        if (!movedComponentId) {
            return;
        }

        componentsStore.moveComponentToLayout(layoutId, movedComponentId, {
            targetIndex: typeof targetIndex === 'number' ? targetIndex : undefined,
            gridColumn,
            gridRow,
            swap,
        });
    }

    /**
     * Создает новый компонент из библиотеки и вставляет его в выбранный layout.
     *
     * @param layoutDropDetail - Параметры вставки.
     */
    function addComponentFromLibrary({
        layoutId,
        gridColumn,
        gridRow,
        targetIndex,
    }: ILayoutDropDetail): void {
        const draggedComponent = dragComposable?.draggedComponent?.value;

        if (!draggedComponent) {
            console.warn('[TheBuilderCanvas] No dragged component found', dragComposable);
            return;
        }

        const componentData = {
            componentName: draggedComponent.name,
            brickPath: draggedComponent.brickPath,
            width: 0,
            height: 0,
            gridColumn: gridColumn || undefined,
            gridRow: gridRow || undefined,
            props: JSON.parse(JSON.stringify(draggedComponent.defaultProps || {})),
            slots: Array.isArray(draggedComponent.slots)
                ? draggedComponent.slots.map((slot: IComponentSlotDefinition) => ({
                      name: slot.name,
                      label: slot.label,
                      description: slot.description,
                      allowMultiple: slot.allowMultiple,
                  }))
                : undefined,
        };

        const childId = componentsStore.addComponent(componentData);
        if (childId) {
            componentsStore.addChildToLayout(
                layoutId,
                childId,
                typeof targetIndex === 'number' ? targetIndex : undefined
            );
        }

        if (dragComposable?.draggedComponent) {
            dragComposable.draggedComponent.value = null;
        }
    }

    /**
     * Обрабатывает кастомное событие `slot-drop` из дочерних слот-зон.
     *
     * @param event - Событие slot-компонента.
     */
    function handleSlotDrop(event: CustomEvent): void {
        commitFlowInstantly();
        const detail = event.detail as ISlotDropDetail;
        const { parentId, slotName, movedComponentId, targetIndex } = detail || {};

        if (!parentId || !slotName) {
            console.warn('[TheBuilderCanvas] Invalid slot drop detail', detail);
            return;
        }

        if (movedComponentId) {
            componentsStore.moveComponentToSlot(
                parentId,
                slotName,
                movedComponentId,
                typeof targetIndex === 'number' ? targetIndex : undefined
            );
            finishDrag();
            return;
        }

        const draggedComponent = dragComposable?.draggedComponent?.value;
        if (!draggedComponent) {
            console.warn('[TheBuilderCanvas] Slot drop without dragged component metadata');
            return;
        }

        const componentData = {
            componentName: draggedComponent.name,
            brickPath: draggedComponent.brickPath,
            width: 0,
            height: 0,
            props: JSON.parse(JSON.stringify(draggedComponent.defaultProps || {})),
            slots: Array.isArray(draggedComponent.slots)
                ? draggedComponent.slots.map((slot: IComponentSlotDefinition) => ({
                      name: slot.name,
                      label: slot.label,
                      description: slot.description,
                      allowMultiple: slot.allowMultiple,
                  }))
                : undefined,
        };

        const childId = componentsStore.addComponent(componentData, { skipHistory: true });
        if (childId) {
            componentsStore.moveComponentToSlot(
                parentId,
                slotName,
                childId,
                typeof targetIndex === 'number' ? targetIndex : undefined,
                { skipHistory: true }
            );
            componentsStore.saveToHistory();
        }

        if (dragComposable?.draggedComponent) {
            dragComposable.draggedComponent.value = null;
        }
        finishDrag();
    }

    return {
        rootDropIndex,
        isRootPlaceholderContained,
        handleRootDragEnter,
        handleRootDragOver,
        handleRootDragLeave,
        handleCanvasDrop,
        handleCanvasDragOver,
        handleLayoutDrop,
        handleSlotDrop,
    };
}
