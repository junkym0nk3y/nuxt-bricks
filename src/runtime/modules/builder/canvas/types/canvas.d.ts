import type { Ref } from 'vue';
import type { IDragComposableCanvas } from './components';
import type { BricksComponentsStore } from '../../core/stores/components';

export interface ICanvasDropIndicator {
    index: number;
    offset: number;
}

export interface ICanvasDropsOptions {
    dragComposable?: IDragComposableCanvas;
    componentsStore: BricksComponentsStore;
    canvasRef: Ref<HTMLElement | null>;
    containerRef: Ref<HTMLElement | null>;
}

export interface ICanvasPanState {
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
}

export interface ICanvasEmptyStateData {
    icon: string;
    title: string;
    description: string;
}

export type {
    IDragComposableCanvas,
    ILayoutDropDetail,
    ISlotDropDetail,
} from './components';
