import type { Ref } from 'vue';
import type { IDragComposableCanvas } from '../components/canvas/types';
import type { LandingComponentsStore } from '../store/landing/components';

export interface ILandingCanvasDropIndicator {
    index: number;
    offset: number;
}

export interface ILandingCanvasDropsOptions {
    dragComposable?: IDragComposableCanvas;
    componentsStore: LandingComponentsStore;
    canvasRef: Ref<HTMLElement | null>;
    containerRef: Ref<HTMLElement | null>;
}

export interface ILandingCanvasPanState {
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
}

export interface ILandingCanvasEmptyStateData {
    icon: string;
    title: string;
    description: string;
}

export type {
    IDragComposableCanvas,
    ILayoutDropDetail,
    ISlotDropDetail,
} from '../components/canvas/types';
