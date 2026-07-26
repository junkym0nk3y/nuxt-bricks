// #region Imports
// Types
import type {
    ILayoutDropZone,
    ILayoutDropZoneDetail,
    ILayoutDropZoneOptions,
} from '../types/dropZone';

// Vue
import { inject, onBeforeUnmount, ref, toValue, watch } from 'vue';

// Utils
import { animateFlowPlaceholder, applyDropEffect } from '../../common/utils/dragAndDrop';

// Constants
import { CANVAS_DRAG_ACTIVE_KEY } from '../../common/constants/injectionKeys';
// #endregion

/**
 * Диспатчит bubbling-событие `layout-drop` с информацией о вставке компонента.
 * Слушается на корне канваса (builder/canvas → handleLayoutDrop).
 *
 * @param el - Элемент drop-зоны, из которого всплывает событие.
 * @param detail - Параметры вставки (layoutId, movedComponentId, targetIndex, …).
 */
function dispatchLayoutDrop(el: HTMLElement | null, detail: ILayoutDropZoneDetail): void {
    const layoutDropEvent = new CustomEvent('layout-drop', {
        detail,
        bubbles: true,
    });
    el?.dispatchEvent(layoutDropEvent);
}

/**
 * Гарантирует единственный flow-плейсхолдер на канвасе: удаляет все чужие
 * layout-плейсхолдеры, осиротевшие из-за ненадёжного dragleave между зонами.
 *
 * @param current - Плейсхолдер активной зоны, который нужно сохранить.
 */
function removeForeignDropPlaceholders(current: HTMLElement | null): void {
    if (typeof document === 'undefined') {
        return;
    }

    const placeholders = document.querySelectorAll<HTMLElement>(
        '[data-layout-drop-destination="true"]'
    );

    placeholders.forEach((node) => {
        if (node !== current) {
            node.remove();
        }
    });
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
    let dropPlaceholder: HTMLElement | null = null;
    let activeDropContainer: HTMLElement | null = null;

    /** Последний применённый индекс вставки: у зон вне потока DOM-позиция не меняется. */
    let placeholderTargetIndex: number | null = null;
    const isCanvasDragActive = inject(CANVAS_DRAG_ACTIVE_KEY, ref(false));
    // #endregion

    // #region Methods
    /**
     * Проверяет, активна ли drop-зона (slider: только в режиме редактора).
     */
    function isEnabled(): boolean {
        return toValue(options.isEnabled) ?? true;
    }

    /**
     * Удаляет flow-плейсхолдер из текущей drop-зоны.
     */
    function removeDropPlaceholder(): void {
        dropPlaceholder?.remove();
        dropPlaceholder = null;
        placeholderTargetIndex = null;
    }

    /**
     * Помечает единственную активную layout drop-зону для лёгкой подсветки.
     *
     * @param container - Текущий контейнер или null при сбросе.
     */
    function setActiveDropContainer(container: HTMLElement | null): void {
        // Повторная отметка того же контейнера снимала бы и возвращала атрибут на
        // каждом dragover — подсветка зоны мигала бы на всю длину своего перехода.
        if (container && activeDropContainer === container) {
            return;
        }

        activeDropContainer?.removeAttribute('data-layout-drop-active');
        activeDropContainer = container;

        if (!container) {
            return;
        }

        const activeContainers = document.querySelectorAll<HTMLElement>(
            '[data-layout-drop-active="true"]'
        );
        activeContainers.forEach((node) => {
            if (node !== container) {
                node.removeAttribute('data-layout-drop-active');
            }
        });
        container.dataset.layoutDropActive = 'true';
    }

    /**
     * Создаёт flow-плейсхолдер с CSS Modules class текущего layout-блока.
     *
     * @returns DOM-элемент плейсхолдера или null, если визуализация не настроена.
     */
    function getDropPlaceholder(): HTMLElement | null {
        if (dropPlaceholder?.isConnected) {
            return dropPlaceholder;
        }

        if (!options.placeholderClass) {
            return null;
        }

        dropPlaceholder = document.createElement('div');
        dropPlaceholder.className = options.placeholderClass;
        dropPlaceholder.dataset.layoutDropDestination = 'true';
        dropPlaceholder.setAttribute('aria-hidden', 'true');
        return dropPlaceholder;
    }

    /**
     * Применяет к плейсхолдеру inline-геометрию зоны для целевого индекса.
     * Зоны без своей раскладки (Flex/Section/Slider) остаются на flow-размерах класса.
     *
     * @param placeholder - Элемент плейсхолдера.
     * @param targetIndex - Индекс места вставки.
     */
    function applyPlaceholderStyle(placeholder: HTMLElement, targetIndex: number): void {
        const style = options.resolvePlaceholderStyle?.(targetIndex);
        if (!style) {
            return;
        }

        Object.entries(style).forEach(([property, value]) => {
            placeholder.style.setProperty(property, value);
        });
    }

    /**
     * Вставляет плейсхолдер между layout children по вычисленному targetIndex.
     *
     * @param event - Текущее drag-событие.
     */
    function syncDropPlaceholder(event: DragEvent): void {
        const container = options.resolvePlaceholderContainer?.() ?? options.containerRef.value;
        const placeholder = getDropPlaceholder();
        const targetIndex = options.resolveDropIndex(event);

        // Активная зона забирает единственный плейсхолдер, вычищая осиротевшие в других зонах.
        removeForeignDropPlaceholders(placeholder);

        if (!container || !placeholder || targetIndex === null) {
            setActiveDropContainer(null);
            removeDropPlaceholder();
            return;
        }

        setActiveDropContainer(container);

        const children =
            options.resolvePlaceholderChildren?.() ??
            Array.from(
                container.querySelectorAll<HTMLElement>(':scope > [data-layout-drop-item="true"]')
            );
        const referenceNode = children[targetIndex] ?? null;

        // Позиция не изменилась — узел не трогаем: insertBefore даже в ту же точку
        // переподключает элемент, а это сбрасывает его анимации на каждом dragover.
        if (
            placeholder.parentNode === container &&
            placeholder.nextElementSibling === referenceNode &&
            placeholderTargetIndex === targetIndex
        ) {
            return;
        }

        const previousRect = placeholder.isConnected ? placeholder.getBoundingClientRect() : null;

        container.insertBefore(placeholder, referenceNode);
        applyPlaceholderStyle(placeholder, targetIndex);
        placeholderTargetIndex = targetIndex;
        animateFlowPlaceholder(placeholder, previousRect);
    }

    /**
     * Полностью сбрасывает drag-состояние зоны (специфичное блоку — через onReset).
     */
    function resetDropState(): void {
        isDragOver.value = false;
        dragDepth.value = 0;
        setActiveDropContainer(null);
        removeDropPlaceholder();
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

        if (!applyDropEffect(event)) {
            resetDropState();
            return;
        }

        isDragOver.value = true;
        options.onDragMove?.(event);
        syncDropPlaceholder(event);
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

        const isAccepted = applyDropEffect(event) && (options.canAcceptDragOver?.(event) ?? true);

        if (!isAccepted) {
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = 'none';
            }
            resetDropState();
            return;
        }

        isDragOver.value = true;
        options.onDragMove?.(event);
        syncDropPlaceholder(event);
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

        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && options.containerRef.value?.contains(nextTarget)) {
            return;
        }

        if (options.useDragDepth) {
            dragDepth.value = Math.max(0, dragDepth.value - 1);
            if (dragDepth.value > 0) {
                return;
            }
        }

        resetDropState();
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

    /**
     * Сбрасывает локальные состояния всех посещённых drop-зон после завершения drag.
     *
     * @param isActive - Глобальное состояние нативной drag-сессии.
     */
    function handleCanvasDragActiveChange(isActive: boolean): void {
        if (!isActive) {
            resetDropState();
        }
    }
    // #endregion

    // #region Lifecycle
    watch(isCanvasDragActive, handleCanvasDragActiveChange);
    onBeforeUnmount(resetDropState);
    // #endregion

    return {
        isDragOver,
        isCanvasDragActive,
        handleDragEnter,
        handleDragOver,
        handleDragLeave,
        handleDrop,
    };
}
