import type { Ref } from 'vue';
import type { IDragComposableCanvas } from './components';
import type { TBricksComponentsStore } from '../../core/stores/components';

export interface ICanvasDropsOptions {
    dragComposable?: IDragComposableCanvas;
    componentsStore: TBricksComponentsStore;
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

/**
 * Navigator with the user agent client hints (`navigator.userAgentData`): they are not in
 * the DOM library yet, while the deprecated `navigator.platform` they replace is.
 */
export interface INavigatorWithUserAgentData extends Navigator {
    userAgentData?: {
        platform?: string;
    };
}

export type { IDragComposableCanvas, ILayoutDropDetail, ISlotDropDetail } from './components';
