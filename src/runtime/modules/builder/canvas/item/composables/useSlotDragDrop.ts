// #region Imports
// Types
import type { ISlotState, IUseSlotDragDropReturn } from '../../types/composables';

// Vue
import { inject, reactive, watch, type ComponentPublicInstance, type VNodeRef } from 'vue';

// Utils
import { applyDropEffect } from '../../../../common/utils/dragAndDrop';

// Constants
import { CANVAS_DRAG_ACTIVE_KEY } from '../../../../common/constants/injectionKeys';
// #endregion

/**
 * Composable для управления поведением drag-and-drop в слотах.
 * Считает индекс вставки, держит состояние drag-over и диспатчит `slot-drop`.
 * Сам плейсхолдер рендерит шаблон по индексу из `getSlotDropIndex`.
 *
 * @param componentId - ID родительского компонента
 * @returns Объект с обработчиками drag-and-drop и состоянием.
 */
export function useSlotDragDrop(componentId: string): IUseSlotDragDropReturn {
    // #region Data
    // Имена слотов приходят из brick-файла: в обычном объекте `slotStates['__proto__']`
    // читался бы как существующая корзина, и drag-обработчики писали бы
    // dragDepth/isDragOver/dropInsertIndex в `Object.prototype`
    const slotStates = reactive(new Map<string, ISlotState>());
    const slotContainerRefs = new Map<string, HTMLElement>();
    const isCanvasDragActive = inject(CANVAS_DRAG_ACTIVE_KEY, null);
    // #endregion

    // #region Methods
    /**
     * Позиция flow-плейсхолдера среди детей слота (читается шаблоном).
     *
     * @param slotName - Имя слота
     * @returns Индекс будущей вставки либо null, если слот не под курсором.
     */
    function getSlotDropIndex(slotName: string): number | null {
        return slotStates.get(slotName)?.dropInsertIndex ?? null;
    }

    /**
     * Преобразует Vue ref в HTMLElement.
     * Обрабатывает как прямые HTMLElements, так и ComponentPublicInstance refs.
     *
     * @param ref - Vue ref, который может быть элементом или экземпляром компонента
     * @returns HTMLElement или null
     */
    function resolveHTMLElement(ref: Element | ComponentPublicInstance | null): HTMLElement | null {
        if (!ref) {
            return null;
        }

        if (ref instanceof HTMLElement) {
            return ref;
        }

        const component = ref as ComponentPublicInstance;
        const el = component.$el;
        if (el instanceof HTMLElement) {
            return el;
        }

        return null;
    }

    /**
     * Обеспечивает существование состояния для заданного слота
     *
     * @param slotName - Имя слота
     * @returns Объект состояния слота
     */
    function ensureSlotState(slotName: string): ISlotState {
        const existing = slotStates.get(slotName);

        if (existing) {
            return existing;
        }

        slotStates.set(slotName, {
            dragDepth: 0,
            isDragOver: false,
            dropInsertIndex: null,
        });

        // Через get, а не через записанный литерал: реактивный прокси нужен,
        // чтобы мутации dragDepth/isDragOver перерисовывали плейсхолдер
        return slotStates.get(slotName) as ISlotState;
    }

    /**
     * Сбрасывает состояние слота к начальным значениям
     *
     * @param slotName - Имя слота для сброса
     */
    function resetSlotState(slotName: string): void {
        const state = ensureSlotState(slotName);
        state.dragDepth = 0;
        state.isDragOver = false;
        state.dropInsertIndex = null;
    }

    /**
     * Создаёт обработчик ref для элемента контейнера слота
     *
     * @param slotName - Имя слота
     * @returns Функция VNodeRef для привязки к template ref
     */
    function setSlotContainerRef(slotName: string): VNodeRef {
        const refHandler: VNodeRef = (element) => {
            const htmlElement = resolveHTMLElement(
                (element as Element | ComponentPublicInstance | null) ?? null
            );
            if (htmlElement) {
                ensureSlotState(slotName);
                slotContainerRefs.set(slotName, htmlElement);
            } else {
                slotContainerRefs.delete(slotName);
            }
        };

        return refHandler;
    }

    /**
     * Получает все дочерние элементы внутри контейнера слота
     *
     * @param slotName - Имя слота
     * @returns Массив дочерних HTMLElements
     */
    function getSlotChildElements(slotName: string): HTMLElement[] {
        const container = slotContainerRefs.get(slotName);
        if (!container) {
            return [];
        }

        return Array.from(container.querySelectorAll<HTMLElement>('[data-slot-child="true"]'));
    }

    /**
     * Обновляет индекс flow-плейсхолдера на основе позиции курсора.
     *
     * @param slotName - Имя слота
     * @param event - Событие drag с позицией курсора
     */
    function updateSlotDropTarget(slotName: string, event: DragEvent): void {
        const container = slotContainerRefs.get(slotName);
        if (!container) {
            return;
        }

        const state = ensureSlotState(slotName);
        const pointerY = event.clientY;
        const children = getSlotChildElements(slotName);
        const hoveredIndex = children.findIndex((child) => {
            const childRect = child.getBoundingClientRect();
            return pointerY < childRect.top + childRect.height / 2;
        });

        state.dropInsertIndex = hoveredIndex === -1 ? children.length : hoveredIndex;
    }

    /**
     * Генерирует кастомное событие slot-drop с деталями drop
     *
     * @param slotName - Имя слота
     * @param event - Событие drop
     */
    function emitSlotDrop(slotName: string, event: DragEvent): void {
        const state = ensureSlotState(slotName);
        const container = slotContainerRefs.get(slotName);
        const movedComponentId =
            event.dataTransfer?.getData('component-id') ||
            event.dataTransfer?.getData('text/plain');

        const slotDropEvent = new CustomEvent('slot-drop', {
            detail: {
                parentId: componentId,
                slotName,
                movedComponentId: movedComponentId || null,
                targetIndex: state.dropInsertIndex ?? null,
            },
            bubbles: true,
        });

        container?.dispatchEvent(slotDropEvent);
    }

    /**
     * Обрабатывает событие drag enter для слота
     *
     * @param slotName - Имя слота
     * @param event - Событие drag enter
     */
    function handleSlotDragEnter(slotName: string, event: DragEvent): void {
        event.preventDefault();
        event.stopPropagation();

        const state = ensureSlotState(slotName);
        state.dragDepth += 1;

        if (!applyDropEffect(event)) {
            resetSlotState(slotName);
            return;
        }

        state.isDragOver = true;
        updateSlotDropTarget(slotName, event);
    }

    /**
     * Обрабатывает событие drag over для слота
     *
     * @param slotName - Имя слота
     * @param event - Событие drag over
     */
    function handleSlotDragOver(slotName: string, event: DragEvent): void {
        event.preventDefault();
        event.stopPropagation();

        if (!applyDropEffect(event)) {
            resetSlotState(slotName);
            return;
        }

        ensureSlotState(slotName).isDragOver = true;
        updateSlotDropTarget(slotName, event);
    }

    /**
     * Обрабатывает событие drag leave для слота
     *
     * @param slotName - Имя слота
     * @param event - Событие drag leave
     */
    function handleSlotDragLeave(slotName: string, event: DragEvent): void {
        event.stopPropagation();

        const container = slotContainerRefs.get(slotName);
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && container?.contains(nextTarget)) {
            return;
        }

        const state = ensureSlotState(slotName);
        state.dragDepth = Math.max(0, state.dragDepth - 1);
        if (state.dragDepth > 0) {
            return;
        }

        resetSlotState(slotName);
    }

    /**
     * Обрабатывает событие drop для слота
     *
     * @param slotName - Имя слота
     * @param event - Событие drop
     */
    function handleSlotDrop(slotName: string, event: DragEvent): void {
        event.preventDefault();
        event.stopPropagation();

        updateSlotDropTarget(slotName, event);
        emitSlotDrop(slotName, event);
        resetSlotState(slotName);
    }

    /**
     * Сбрасывает transient-состояние всех посещённых слотов.
     */
    function resetAllSlotStates(): void {
        for (const slotName of Array.from(slotStates.keys())) {
            resetSlotState(slotName);
        }
    }

    /**
     * Убирает плейсхолдеры слотов при окончании или отмене drag.
     *
     * @param isActive - Активна ли глобальная drag-сессия canvas.
     */
    function handleCanvasDragActiveChange(isActive: boolean): void {
        if (!isActive) {
            resetAllSlotStates();
        }
    }
    // #endregion

    // #region Lifecycle
    if (isCanvasDragActive) {
        watch(isCanvasDragActive, handleCanvasDragActiveChange, { flush: 'sync' });
    }
    // #endregion

    return {
        getSlotDropIndex,
        setSlotContainerRef,
        handleSlotDragEnter,
        handleSlotDragOver,
        handleSlotDragLeave,
        handleSlotDrop,
    };
}
