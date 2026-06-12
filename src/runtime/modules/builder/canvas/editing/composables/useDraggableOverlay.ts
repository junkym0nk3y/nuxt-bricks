// Types
import type { IDraggableOverlayOptions } from '../../types/composables';

// Vue
import { ref, computed, watch } from 'vue';

// VueUse
import { useElementBounding, useResizeObserver } from '@vueuse/core';

/** Отступ overlay от курсора и краёв viewport. */
const VIEWPORT_GAP = 42;

/**
 * Перетаскиваемый fixed-overlay, привязанный к якорному элементу:
 * позиционирование с clamp к viewport (useElementBounding следует при скролле),
 * drag по handle с накоплением смещения.
 */
export function useDraggableOverlay(options: IDraggableOverlayOptions) {
    /** Размеры overlay — обновляются только при изменении размера (не при скролле) */
    const overlaySize = ref({ width: 400, height: 120 });

    useResizeObserver(options.overlayRef, (entries) => {
        const { width, height } = entries[0].contentRect;
        overlaySize.value = { width, height };
    });

    const { top: elTop, left: elLeft } = useElementBounding(options.anchorElement);

    /** Смещение overlay, заданное пользователем через перетаскивание */
    const dragOffset = ref({ x: 0, y: 0 });

    /** Флаг активного перетаскивания */
    const isDragging = ref(false);

    /**
     * Сбрасывает drag-смещение при смене ключа (редактируемого компонента).
     */
    watch(
        options.resetKey,
        () => {
            dragOffset.value = { x: 0, y: 0 };
        },
        { immediate: true }
    );

    /**
     * Fixed стили позиционирования overlay.
     * Левый край совпадает с позицией курсора в момент открытия, верх — над курсором;
     * при выходе за верхний край overlay размещается ниже курсора.
     */
    const overlayStyle = computed(() => {
        const offset = options.cursorOffset();

        const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
        const vh = typeof window !== 'undefined' ? window.innerHeight : 1080;

        const overlayH = overlaySize.value.height;
        const overlayW = overlaySize.value.width;

        const cursorY = elTop.value + (offset?.y ?? 0) + dragOffset.value.y;
        const rawLeft = elLeft.value + (offset?.x ?? 0) + dragOffset.value.x;
        const rawTop = cursorY - overlayH - VIEWPORT_GAP;

        const left = Math.max(VIEWPORT_GAP, Math.min(vw - overlayW - VIEWPORT_GAP, rawLeft));

        // Если overlay уходит за верхний край — размещаем ниже курсора
        let top = rawTop < VIEWPORT_GAP ? cursorY + VIEWPORT_GAP : rawTop;
        // Ограничиваем снизу и сверху, чтобы overlay всегда оставался в пределах viewport
        top = Math.max(VIEWPORT_GAP, Math.min(top, vh - overlayH - VIEWPORT_GAP));

        return {
            position: 'fixed' as const,
            top: `${top}px`,
            left: `${left}px`,
        };
    });

    /**
     * Запускает перетаскивание overlay по drag handle.
     */
    function onDragHandleMousedown(event: MouseEvent): void {
        event.preventDefault();

        isDragging.value = true;
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';

        const startX = event.clientX - dragOffset.value.x;
        const startY = event.clientY - dragOffset.value.y;

        function handleMousemove(e: MouseEvent): void {
            dragOffset.value = {
                x: e.clientX - startX,
                y: e.clientY - startY,
            };
        }

        function handleMouseup(): void {
            isDragging.value = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', handleMousemove);
            document.removeEventListener('mouseup', handleMouseup);
        }

        document.addEventListener('mousemove', handleMousemove);
        document.addEventListener('mouseup', handleMouseup);
    }

    return { isDragging, overlayStyle, onDragHandleMousedown };
}
