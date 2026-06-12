// #region Imports
// Types
import type { ISlotState, IUseSlotDragDropReturn } from '../../types/composables';

// Vue
import {
    computed,
    reactive,
    type ComponentPublicInstance,
    type CSSProperties,
    type VNodeRef,
} from 'vue';
// #endregion

// #region Constants
/**
 * Стили по умолчанию для индикатора drop в слоте
 */
const DEFAULT_SLOT_STYLE: CSSProperties = {
    transform: 'translateY(0px)',
    opacity: 0,
};
// #endregion

/**
 * Composable для управления поведением drag-and-drop в слотах.
 * Обрабатывает индикаторы drop, состояние перетаскивания и события drop для слотов компонентов.
 *
 * @param componentId - ID родительского компонента
 * @returns Объект с обработчиками drag-and-drop и состоянием
 */
export function useSlotDragDrop(componentId: string): IUseSlotDragDropReturn {
    // #region Data
    const slotStates = reactive<Record<string, ISlotState>>({});
    const slotContainerRefs = new Map<string, HTMLElement>();
    // #endregion

    // #region Computed
    /**
     * Вычисляемые стили для индикаторов drop на основе текущего состояния перетаскивания
     */
    const slotIndicatorStyles = computed<Record<string, CSSProperties>>(() => {
        const styles: Record<string, CSSProperties> = {};

        Object.entries(slotStates).forEach(([name, state]) => {
            styles[name] = {
                transform: `translateY(${state?.dropIndicator?.offset ?? 0}px)`,
                opacity: state?.dropIndicator ? 1 : 0,
            };
        });

        return styles;
    });
    // #endregion

    // #region Methods
    /**
     * Получает вычисленный стиль индикатора для конкретного слота
     *
     * @param slotName - Имя слота
     * @returns CSS свойства для индикатора drop
     */
    function getSlotIndicatorStyle(slotName: string): CSSProperties {
        return slotIndicatorStyles.value[slotName] || DEFAULT_SLOT_STYLE;
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
        if (!slotStates[slotName]) {
            slotStates[slotName] = {
                dragDepth: 0,
                isDragOver: false,
                dropIndicator: null,
                dropInsertIndex: null,
            };
        }

        return slotStates[slotName];
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
        state.dropIndicator = null;
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

        return Array.from(
            container.querySelectorAll<HTMLElement>('[data-slot-child="true"]')
        ).filter((element) => element.dataset.slotIndicator !== 'true');
    }

    /**
     * Обновляет эффект drag на основе типа перетаскиваемых данных
     *
     * @param event - Событие drag
     */
    function updateSlotDropEffect(event: DragEvent): void {
        if (!event.dataTransfer) {
            return;
        }

        const types = Array.from(event.dataTransfer.types || []);
        const isExisting = types.includes('component-id') || types.includes('text/plain');
        const isLibrary = types.includes('application/json');

        if (!isExisting && !isLibrary) {
            event.dataTransfer.dropEffect = 'none';
            return;
        }

        event.dataTransfer.dropEffect = isExisting ? 'move' : 'copy';
    }

    /**
     * Обновляет позицию индикатора drop на основе позиции курсора
     *
     * @param slotName - Имя слота
     * @param event - Событие drag с позицией курсора
     */
    function updateSlotDropIndicator(slotName: string, event: DragEvent): void {
        const container = slotContainerRefs.get(slotName);
        if (!container) {
            return;
        }

        const state = ensureSlotState(slotName);
        const rect = container.getBoundingClientRect();
        const pointerY = event.clientY;
        const containerHeight = container.clientHeight;
        const children = getSlotChildElements(slotName);

        if (children.length === 0) {
            const offset = Math.max(0, Math.min(pointerY - rect.top, containerHeight));
            state.dropIndicator = {
                index: 0,
                offset,
            };
            state.dropInsertIndex = 0;
            return;
        }

        let targetIndex = children.length;
        let offset = containerHeight;

        for (let index = 0; index < children.length; index += 1) {
            const child = children[index];
            const childRect = child.getBoundingClientRect();
            const midpoint = childRect.top + childRect.height / 2;

            if (pointerY < midpoint) {
                targetIndex = index;
                offset = child.offsetTop;
                break;
            }
        }

        if (targetIndex === children.length) {
            const lastChild = children[children.length - 1];
            offset = lastChild.offsetTop + lastChild.offsetHeight;
        }

        offset = Math.max(0, Math.min(offset, containerHeight));

        state.dropIndicator = {
            index: targetIndex,
            offset,
        };
        state.dropInsertIndex = targetIndex;
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
        state.isDragOver = true;

        updateSlotDropEffect(event);
        updateSlotDropIndicator(slotName, event);
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

        const state = ensureSlotState(slotName);
        state.isDragOver = true;

        updateSlotDropEffect(event);
        updateSlotDropIndicator(slotName, event);
    }

    /**
     * Обрабатывает событие drag leave для слота
     *
     * @param slotName - Имя слота
     * @param event - Событие drag leave
     */
    function handleSlotDragLeave(slotName: string, event: DragEvent): void {
        event.stopPropagation();

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

        updateSlotDropIndicator(slotName, event);
        emitSlotDrop(slotName, event);
        resetSlotState(slotName);
    }
    // #endregion

    return {
        slotIndicatorStyles,
        getSlotIndicatorStyle,
        setSlotContainerRef,
        handleSlotDragEnter,
        handleSlotDragOver,
        handleSlotDragLeave,
        handleSlotDrop,
    };
}
