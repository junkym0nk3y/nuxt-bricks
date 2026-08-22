// Vue
import { onMounted, onBeforeUnmount } from 'vue';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';

/**
 * Drops the interactive preview on a click outside the component: a capture-phase
 * pointerdown listener on the document, attached and detached in the lifecycle of the
 * calling component.
 */
export function useInteractivePreviewDismiss(): void {
    const componentsStore = useComponentsStore();

    /**
     * Capture phase: drops the interactive preview on a click outside the component.
     * Capture runs BEFORE any stopPropagation in child elements, so it works even while
     * the interactive component swallows events.
     */
    function handleInteractivePreviewOutsideClick(event: PointerEvent): void {
        const previewId = componentsStore.interactivePreviewId;
        if (!previewId) {
            return;
        }

        const target = event.target as HTMLElement;

        // A click inside the interactive component itself keeps the preview
        if (target.closest(`[data-component-id="${previewId}"]`)) {
            return;
        }

        // A click on the context menu (teleported into body) keeps the preview
        if (target.closest('[data-canvas-context-menu]')) {
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
