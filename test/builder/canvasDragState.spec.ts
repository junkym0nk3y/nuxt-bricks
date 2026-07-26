// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('nuxt/app', () => ({
    useAppConfig: vi.fn(() => ({})),
}));

// Stores
import { useCanvasStore } from '../../src/runtime/modules/builder/core/stores/canvas';

describe('canvas drag state', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('сохраняет измеренные размеры блока без фиксированного clamp', () => {
        const canvasStore = useCanvasStore();

        canvasStore.startCanvasDrag({
            source: 'canvas',
            componentId: 'avatar-grid',
            width: 318,
            height: 184,
            isFullWidth: false,
        });

        expect(canvasStore.dragState.width).toBe(318);
        expect(canvasStore.dragState.height).toBe(184);
    });

    it('полностью очищает transient-размеры при завершении drag', () => {
        const canvasStore = useCanvasStore();
        canvasStore.startCanvasDrag({
            source: 'library',
            width: 1440,
            height: 180,
            isFullWidth: true,
        });

        canvasStore.finishCanvasDrag();

        expect(canvasStore.dragState).toEqual({
            source: null,
            componentId: null,
            width: 0,
            height: 0,
            isFullWidth: false,
            sourceVacated: false,
        });
    });

    it('убирает оригинал из потока только отложенно, после старта нативного drag', () => {
        const canvasStore = useCanvasStore();

        canvasStore.startCanvasDrag({
            source: 'canvas',
            componentId: 'hero-section',
            width: 1440,
            height: 240,
            isFullWidth: true,
        });

        expect(canvasStore.dragState.sourceVacated).toBe(false);

        canvasStore.vacateDragSource();

        expect(canvasStore.dragState.sourceVacated).toBe(true);
    });

    it('игнорирует vacate вне drag-сессии', () => {
        const canvasStore = useCanvasStore();

        canvasStore.vacateDragSource();

        expect(canvasStore.dragState.sourceVacated).toBe(false);
    });
});
