// Vue
import { onMounted, onBeforeUnmount } from 'vue';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';

/**
 * Сброс интерактивного предпросмотра при клике вне компонента:
 * capture-обработчик pointerdown на document с подпиской/отпиской
 * в lifecycle вызывающего компонента.
 */
export function useInteractivePreviewDismiss(): void {
    const componentsStore = useComponentsStore();

    /**
     * Capture-фаза: сбрасывает интерактивный предпросмотр при клике вне компонента.
     * Capture срабатывает ДО stopPropagation в дочерних элементах,
     * поэтому работает даже когда интерактивный компонент перехватывает события.
     */
    function handleInteractivePreviewOutsideClick(event: PointerEvent): void {
        const previewId = componentsStore.interactivePreviewId;
        if (!previewId) {
            return;
        }

        const target = event.target as HTMLElement;

        // Клик внутри самого интерактивного компонента — не сбрасываем
        if (target.closest(`[data-component-id="${previewId}"]`)) {
            return;
        }

        // Клик по тулбару (телепортирован в body) — не сбрасываем
        if (target.closest('[data-canvas-toolbar]')) {
            return;
        }

        componentsStore.interactivePreviewId = null;
    }

    onMounted(() => {
        document.addEventListener('pointerdown', handleInteractivePreviewOutsideClick, true);
    });

    onBeforeUnmount(() => {
        document.removeEventListener('pointerdown', handleInteractivePreviewOutsideClick, true);
    });
}
