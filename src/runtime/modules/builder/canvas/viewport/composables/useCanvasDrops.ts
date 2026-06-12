import { computed, ref } from 'vue';
import type { IComponentSlotDefinition } from '../../../../common/types/brick';
import type {
    ICanvasDropIndicator,
    ICanvasDropsOptions,
    ILayoutDropDetail,
    ISlotDropDetail,
} from '../../types/canvas';

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
    const rootDropIndicator = ref<ICanvasDropIndicator | null>(null);
    const rootDropIndicatorRef = ref<HTMLElement | null>(null);
    const rootDropInsertIndex = ref<number | null>(null);
    const rootDragDepth = ref(0);

    const rootDropIndicatorVisible = computed(() => rootDropIndicator.value !== null);
    const rootDropIndicatorStyle = computed<Record<string, string>>(() => {
        return rootDropIndicator.value
            ? {
                  opacity: '1',
                  top: `${rootDropIndicator.value.offset}px`,
                  left: '0',
                  width: '100%',
                  height: '0.2rem',
                  transform: 'translateY(-50%)',
              }
            : {
                  opacity: '0',
                  top: '0',
                  left: '0',
                  width: '100%',
                  height: '0.2rem',
                  transform: 'translateY(-50%)',
              };
    });

    /**
     * Обрабатывает drop по корневой области канваса и передает данные drag-композиблу.
     *
     * @param event - Нативное drop-событие браузера.
     */
    function handleCanvasDrop(event: DragEvent): void {
        if (canvasRef.value && dragComposable?.handleDrop) {
            updateRootDropIndicator(event);

            const rootTargetIndex =
                typeof rootDropInsertIndex.value === 'number'
                    ? rootDropInsertIndex.value
                    : (rootDropIndicator.value?.index ?? null);

            dragComposable.handleDrop(event, canvasRef.value, componentsStore, {
                rootTargetIndex,
            });

            resetRootDropIndicator();
            rootDragDepth.value = 0;
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
     * Сбрасывает состояние индикатора и глубины drag-событий на корне.
     */
    function resetRootDropIndicator(): void {
        rootDropIndicator.value = null;
        rootDropInsertIndex.value = null;
        rootDragDepth.value = 0;
    }

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
        updateRootDropIndicator(event);
    }

    /**
     * Пересчитывает индикатор при перемещении курсора внутри drop-зоны.
     *
     * @param event - Текущее dragover-событие.
     */
    function handleRootDragOver(event: DragEvent): void {
        if (!shouldHandleRootDrag(event)) {
            resetRootDropIndicator();
            return;
        }

        event.preventDefault();
        updateRootDropIndicator(event);
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
            resetRootDropIndicator();
        }
    }

    /**
     * Пересчитывает позицию и индекс корневого индикатора drop-зоны.
     *
     * @param event - Текущее dragover-событие.
     */
    function updateRootDropIndicator(event: DragEvent): void {
        const container = containerRef.value;
        if (!container || !event.dataTransfer) {
            return;
        }

        if (!shouldHandleRootDrag(event)) {
            resetRootDropIndicator();
            return;
        }

        const types = Array.from(event.dataTransfer.types || []);
        const isExisting = types.includes('component-id') || types.includes('text/plain');
        const isLibrary = types.includes('application/json');

        if (!isExisting && !isLibrary) {
            event.dataTransfer.dropEffect = 'none';
            resetRootDropIndicator();
            return;
        }

        event.dataTransfer.dropEffect = isExisting ? 'move' : 'copy';

        const rect = container.getBoundingClientRect();
        const indicatorEl = rootDropIndicatorRef.value;
        const children = Array.from(container.children).filter((child) => {
            const el = child as HTMLElement;
            if (!el) {
                return false;
            }
            if (indicatorEl && el === indicatorEl) {
                return false;
            }
            return el.hasAttribute('data-layout-drop-item');
        }) as HTMLElement[];

        const pointerY = event.clientY;
        const containerExtent = container.clientHeight;
        const computedStyle = window.getComputedStyle(container);
        const gapValue = parseFloat(computedStyle.rowGap || computedStyle.gap || '0') || 0;
        const halfGap = gapValue / 2;

        if (children.length === 0) {
            const offset = Math.max(0, Math.min(pointerY - rect.top, containerExtent));
            rootDropIndicator.value = {
                index: 0,
                offset,
            };
            rootDropInsertIndex.value = 0;
            return;
        }

        let targetIndex = children.length;
        let offset = containerExtent;

        children.some((child, index) => {
            const childRect = child.getBoundingClientRect();
            const mid = childRect.top + childRect.height / 2;

            if (pointerY < mid) {
                targetIndex = index;
                const childStyle = window.getComputedStyle(child as HTMLElement);
                const marginTop = parseFloat(childStyle.marginTop || '0');
                const spacingBefore = Math.max(halfGap, marginTop / 2);
                offset = (child as HTMLElement).offsetTop - spacingBefore;
                return true;
            }

            return false;
        });

        if (targetIndex === children.length) {
            const lastChild = children[children.length - 1] as HTMLElement;
            const lastStyle = window.getComputedStyle(lastChild);
            const marginBottom = parseFloat(lastStyle.marginBottom || '0');
            const spacingAfter = Math.max(halfGap, marginBottom / 2);
            offset = lastChild.offsetTop + lastChild.offsetHeight + spacingAfter;
        }

        offset = Math.max(0, Math.min(offset, containerExtent));

        rootDropIndicator.value = {
            index: targetIndex,
            offset,
        };
        rootDropInsertIndex.value = targetIndex;
    }

    /**
     * Обрабатывает кастомное событие `layout-drop` от дочерних layout-компонентов.
     *
     * @param event - Событие layout-компонента.
     */
    function handleLayoutDrop(event: CustomEvent): void {
        resetRootDropIndicator();
        const detail = event.detail as ILayoutDropDetail;
        const { movedComponentId } = detail;

        if (detail.layoutId && movedComponentId && detail.layoutId === movedComponentId) {
            console.warn('[TheBuilderCanvas] Ignoring layout drop on self', detail);
            return;
        }

        if (movedComponentId) {
            moveExistingComponent(detail);
            return;
        }

        addComponentFromLibrary(detail);
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
    }

    return {
        rootDropIndicatorVisible,
        rootDropIndicatorStyle,
        rootDropIndicatorRef,
        handleRootDragEnter,
        handleRootDragOver,
        handleRootDragLeave,
        handleCanvasDrop,
        handleCanvasDragOver,
        handleLayoutDrop,
        handleSlotDrop,
    };
}
