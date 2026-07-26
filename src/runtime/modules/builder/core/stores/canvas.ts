import { defineStore } from 'pinia';
import { useAppConfig } from 'nuxt/app';
import type {
    ICanvasDragState,
    ICanvasDragStartPayload,
    ICanvasState,
    TBricksDeviceKey,
} from '../../../common/types/brick';
import type { IAppConfig } from '../../../common/types/config';
import { MIN_CANVAS_SCALE, MAX_CANVAS_SCALE } from '../constants/canvasScale';

const VIEWPORT_BASE_HEIGHT: Record<TBricksDeviceKey, number> = {
    mobile: 812,
    tablet: 1024,
    desktop: 1080,
};
const CANVAS_HEIGHT_BUFFER = 400;

/** Состояние покоя transient drag-сессии: единственный источник дефолтов. */
const IDLE_DRAG_STATE: ICanvasDragState = {
    source: null,
    componentId: null,
    width: 0,
    height: 0,
    isFullWidth: false,
    sourceVacated: false,
};

/**
 * Возвращает ширину холста для viewport из конфига (с дефолтами).
 */
function getConfiguredViewportWidth(viewport: TBricksDeviceKey): number {
    const appConfig = useAppConfig() as IAppConfig;
    const canvasBreakpoints = appConfig?.bricks?.breakpoints;

    const widths = {
        mobile: canvasBreakpoints?.mobile?.width ?? 375,
        tablet: canvasBreakpoints?.tablet?.width ?? 768,
        desktop: canvasBreakpoints?.desktop?.width ?? 1600,
    };

    return widths[viewport];
}

/**
 * Инкапсулирует логику размеров холста: ширину, высоту, масштаб и текущий viewport.
 * Используется для расчёта настройки канваса и синхронизации с реальными размерами контента.
 */
export const useCanvasStore = defineStore('bricksCanvas', {
    state: (): ICanvasState => ({
        width: 1920,
        height: VIEWPORT_BASE_HEIGHT.desktop,
        scale: 1,
        viewport: 'desktop',
        isFigmaMode: false,
        showGrid: true,
        isViewportSwitching: false,
        hasManualZoom: false,
        activeViewport: null,
        figmaDropPerViewport: false,
        dragState: { ...IDLE_DRAG_STATE },
        _preFigmaWidth: null,
        _preFigmaHeight: null,
    }),

    actions: {
        /**
         * Синхронизирует размеры холста с конфигом для текущего viewport.
         * Вызывается при инициализации билдера: дефолт state (1920) может
         * не совпадать с шириной viewport из app.config.
         */
        initCanvasSize() {
            this.width = getConfiguredViewportWidth(this.viewport);
            this.height = VIEWPORT_BASE_HEIGHT[this.viewport] ?? VIEWPORT_BASE_HEIGHT.desktop;
        },

        /**
         * Устанавливает масштаб холста в допустимых пределах [0.1, 4].
         *
         * @param scale - Новое значение масштаба.
         */
        setCanvasScale(scale: number) {
            this.scale = Math.max(MIN_CANVAS_SCALE, Math.min(MAX_CANVAS_SCALE, scale));
        },

        /**
         * Устанавливает масштаб как ручной (wheel/кнопки) — авто-фит его не перетирает.
         *
         * @param scale - Новое значение масштаба.
         */
        setManualCanvasScale(scale: number) {
            this.hasManualZoom = true;
            this.setCanvasScale(scale);
        },

        /**
         * Меняет активный viewport и ширину холста.
         * При выходе из Figma mode с тем же viewport — восстанавливает сохранённые размеры.
         *
         * @param viewport - Новый viewport.
         */
        setViewport(viewport: TBricksDeviceKey) {
            const wasInFigma = this.isFigmaMode;
            this.isViewportSwitching = true;
            this.isFigmaMode = false;
            this.activeViewport = null;
            this.hasManualZoom = false;

            // Если выходим из Figma mode с тем же viewport — восстанавливаем размеры
            if (wasInFigma && viewport === this.viewport && this._preFigmaWidth !== null) {
                this.width = this._preFigmaWidth;
                this.height = this._preFigmaHeight ?? VIEWPORT_BASE_HEIGHT[viewport];
                this._preFigmaWidth = null;
                this._preFigmaHeight = null;
            } else {
                this.viewport = viewport;
                this.width = getConfiguredViewportWidth(viewport);

                const baseHeight = VIEWPORT_BASE_HEIGHT[viewport] ?? VIEWPORT_BASE_HEIGHT.desktop;
                this.height = baseHeight;

                this._preFigmaWidth = null;
                this._preFigmaHeight = null;
            }

            setTimeout(() => {
                this.isViewportSwitching = false;
            }, 400);
        },

        /**
         * Переключает Figma Mode (три viewport-а одновременно).
         * При входе сохраняет текущие размеры, при выходе — восстанавливает.
         */
        toggleFigmaMode() {
            this.isViewportSwitching = true;

            if (!this.isFigmaMode) {
                // Входим в Figma mode — сохраняем текущие размеры
                this._preFigmaWidth = this.width;
                this._preFigmaHeight = this.height;
            } else {
                // Выходим из Figma mode — восстанавливаем размеры
                if (this._preFigmaWidth !== null) {
                    this.width = this._preFigmaWidth;
                }
                if (this._preFigmaHeight !== null) {
                    this.height = this._preFigmaHeight;
                }
                this._preFigmaWidth = null;
                this._preFigmaHeight = null;
            }

            this.isFigmaMode = !this.isFigmaMode;

            setTimeout(() => {
                this.isViewportSwitching = false;
            }, 400);
        },

        /**
         * Переключает видимость визуальной сетки layout-компонентов.
         */
        toggleGrid() {
            this.showGrid = !this.showGrid;
        },

        /**
         * Начинает transient drag-сессию без изменения дерева компонентов.
         *
         * @param payload - Источник и фактический размер будущего плейсхолдера.
         */
        startCanvasDrag(payload: ICanvasDragStartPayload) {
            this.dragState = {
                ...IDLE_DRAG_STATE,
                source: payload.source,
                componentId: payload.componentId ?? null,
                width: Math.max(0, payload.width),
                height: Math.max(0, payload.height),
                isFullWidth: payload.isFullWidth === true,
            };
        },

        /**
         * Убирает оригинал из потока после того, как нативный drag уже стартовал.
         * Вызывается отложенно (rAF/timeout) — синхронный display:none отменил бы drag.
         */
        vacateDragSource() {
            if (this.dragState.source === null) {
                return;
            }
            this.dragState = {
                ...this.dragState,
                sourceVacated: true,
            };
        },

        /**
         * Завершает или отменяет drag-сессию, восстанавливая исходный рендер.
         */
        finishCanvasDrag() {
            this.dragState = { ...IDLE_DRAG_STATE };
        },

        /**
         * Синхронизирует высоту холста с фактическим контентом.
         *
         * @param contentHeight - Высота содержимого канваса в px.
         * @param hasComponents - Есть ли компоненты на холсте.
         */
        syncCanvasHeightWithContent(contentHeight: number, hasComponents: boolean) {
            const baseHeight = VIEWPORT_BASE_HEIGHT[this.viewport] ?? VIEWPORT_BASE_HEIGHT.desktop;

            if (!hasComponents) {
                if (this.height !== baseHeight) {
                    this.height = baseHeight;
                }
                return;
            }

            const baselineWithBuffer = baseHeight + CANVAS_HEIGHT_BUFFER;
            const targetHeight = Math.max(
                baselineWithBuffer,
                Math.ceil(contentHeight + CANVAS_HEIGHT_BUFFER)
            );

            if (Math.abs(this.height - targetHeight) > 1) {
                this.height = targetHeight;
            }
        },
    },
});
