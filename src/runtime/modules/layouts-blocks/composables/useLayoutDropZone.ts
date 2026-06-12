// #region Imports
// Types
import type {
    ILayoutDropZone,
    ILayoutDropZoneDetail,
    ILayoutDropZoneOptions,
} from '../types/dropZone';

// Vue
import { ref, toValue } from 'vue';
// #endregion

/**
 * Диспатчит bubbling-событие `layout-drop` с информацией о вставке компонента.
 * Слушается на корне канваса (builder/canvas → handleLayoutDrop).
 *
 * @param el - Элемент drop-зоны, из которого всплывает событие.
 * @param detail - Параметры вставки (layoutId, movedComponentId, targetIndex, …).
 */
export function dispatchLayoutDrop(el: HTMLElement | null, detail: ILayoutDropZoneDetail): void {
    const layoutDropEvent = new CustomEvent('layout-drop', {
        detail,
        bubbles: true,
    });
    el?.dispatchEvent(layoutDropEvent);
}

/**
 * Общая drag&drop-логика layout-блоков (Grid/Flex/Section/Slider):
 * dropEffect по типу payload, drag-over состояние с опциональным счётчиком
 * вложенности, guard от self-drop и dispatch события `layout-drop`.
 * Специфика блока (ёмкость грида, drop-индикатор) подключается через хуки опций.
 *
 * @param options - Конфигурация зоны и хуки специфики блока.
 */
export function useLayoutDropZone(options: ILayoutDropZoneOptions): ILayoutDropZone {
    // #region Data
    const isDragOver = ref(false);

    /** Глубина вложенных dragenter/dragleave (курсор над детьми зоны) */
    const dragDepth = ref(0);
    // #endregion

    // #region Methods
    /**
     * Проверяет, активна ли drop-зона (slider: только в режиме редактора).
     */
    function isEnabled(): boolean {
        return toValue(options.isEnabled) ?? true;
    }

    /**
     * Устанавливает dropEffect на основе типа перетаскиваемого элемента.
     * Без явного dropEffect браузер может отклонить drop.
     *
     * @param event - Текущее drag-событие.
     */
    function updateDropEffect(event: DragEvent): void {
        if (!event.dataTransfer) {
            return;
        }

        const types = Array.from(event.dataTransfer.types || []);
        const isExisting = types.includes('component-id') || types.includes('text/plain');
        const isLibrary = types.includes('application/json');

        if (!isExisting && !isLibrary) {
            event.dataTransfer.dropEffect = 'none';
            options.onReset?.();
            return;
        }

        event.dataTransfer.dropEffect = isExisting ? 'move' : 'copy';
    }

    /**
     * Полностью сбрасывает drag-состояние зоны (специфичное блоку — через onReset).
     */
    function resetDropState(): void {
        isDragOver.value = false;
        dragDepth.value = 0;
        options.onReset?.();
    }

    /**
     * Обрабатывает вход курсора в drop-зону во время перетаскивания.
     * Без preventDefault на dragenter браузер может не считать зону валидной.
     *
     * @param event - Текущее dragenter-событие.
     */
    function handleDragEnter(event: DragEvent): void {
        if (!isEnabled()) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();

        if (options.useDragDepth) {
            dragDepth.value += 1;
        }

        isDragOver.value = true;
        updateDropEffect(event);
        options.onDragMove?.(event);
    }

    /**
     * Активирует drag-over состояние и разрешает drop на зону.
     *
     * @param event - Dragover-событие браузера.
     */
    function handleDragOver(event: DragEvent): void {
        if (!isEnabled()) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();

        updateDropEffect(event);

        if (options.canAcceptDragOver && !options.canAcceptDragOver(event)) {
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = 'none';
            }
            isDragOver.value = false;
            return;
        }

        isDragOver.value = true;
        options.onDragMove?.(event);
    }

    /**
     * Сбрасывает drag-over состояние при выходе курсора за пределы зоны.
     *
     * @param event - Dragleave-событие браузера.
     */
    function handleDragLeave(event: DragEvent): void {
        if (!isEnabled()) {
            return;
        }
        event.stopPropagation();

        if (options.useDragDepth) {
            dragDepth.value = Math.max(0, dragDepth.value - 1);
            if (dragDepth.value > 0) {
                return;
            }
        }

        isDragOver.value = false;
        options.onReset?.();
    }

    /**
     * Обрабатывает drop и диспатчит `layout-drop` с информацией о вставке.
     *
     * @param event - Drop-событие браузера.
     */
    function handleDrop(event: DragEvent): void {
        if (!isEnabled()) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();

        updateDropEffect(event);
        options.onDragMove?.(event);

        const movedComponentId = event.dataTransfer?.getData('component-id') || null;
        const layoutId = toValue(options.layoutId);

        if (movedComponentId && layoutId && movedComponentId === layoutId) {
            console.warn('[useLayoutDropZone] Ignoring self drop attempt', layoutId);
            resetDropState();
            return;
        }

        if (options.canAcceptDrop && !options.canAcceptDrop(event, movedComponentId)) {
            resetDropState();
            return;
        }

        const targetIndex = options.resolveDropIndex(event);

        if (targetIndex === null && options.requireDropIndex) {
            resetDropState();
            return;
        }

        dispatchLayoutDrop(options.containerRef.value, {
            layoutId,
            movedComponentId,
            targetIndex,
            ...options.extraDropDetail,
        });
        resetDropState();
    }
    // #endregion

    return {
        isDragOver,
        updateDropEffect,
        resetDropState,
        handleDragEnter,
        handleDragOver,
        handleDragLeave,
        handleDrop,
    };
}
