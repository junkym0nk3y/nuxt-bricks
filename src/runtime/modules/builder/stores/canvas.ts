import { defineStore } from 'pinia';
import { useAppConfig } from 'nuxt/app';
import type { CanvasState } from '../../common/types/brick';
import { convertRemToPx } from '../../common/utils/main';
import { useSidebarStore } from './sidebar';

const VIEWPORT_BASE_HEIGHT: Record<'mobile' | 'tablet' | 'desktop', number> = {
    mobile: 812,
    tablet: 1024,
    desktop: 1080,
};
const CANVAS_HEIGHT_BUFFER = 400;

/**
 * Инкапсулирует логику размеров холста: ширину, высоту, масштаб и текущий viewport.
 * Используется для расчёта настройки канваса и синхронизации с реальными размерами контента.
 */
export const useCanvasStore = defineStore('bricksCanvas', {
    state: (): CanvasState => ({
        width: 1920,
        height: VIEWPORT_BASE_HEIGHT.desktop,
        scale: 1,
        viewport: 'desktop',
        isFigmaMode: false,
        showGrid: true,
        isViewportSwitching: false,
        activeViewport: null,
        figmaDropPerViewport: false,
        _preFigmaWidth: null,
        _preFigmaHeight: null,
    }),

    getters: {
        /**
         * Вычисляет оптимальный масштаб холста с учётом видимости сайдбара.
         */
        optimalScale(state): number {
            if (typeof window === 'undefined') {
                return 1;
            }

            const sidebarStore = useSidebarStore();
            const leftWidth = sidebarStore.left.visible ? sidebarStore.left.width : '0';
            const availableWidth = window.innerWidth - convertRemToPx(leftWidth || '0') - 40;
            const availableHeight = window.innerHeight - 40;

            const scaleX = availableWidth / state.width;
            const scaleY = availableHeight / state.height;

            return Math.min(scaleX, scaleY, 1);
        },
    },

    actions: {
        /**
         * Устанавливает масштаб холста в допустимых пределах.
         *
         * @param scale - Новое значение масштаба.
         */
        setCanvasScale(scale: number) {
            this.scale = Math.max(0.1, Math.min(1, scale));
        },

        /**
         * Увеличивает масштаб холста.
         */
        zoomIn() {
            this.setCanvasScale(this.scale + 0.1);
        },

        /**
         * Уменьшает масштаб холста.
         */
        zoomOut() {
            this.setCanvasScale(this.scale - 0.1);
        },

        /**
         * Сбрасывает масштаб к оптимальному значению.
         */
        zoomReset() {
            this.setCanvasScale(this.optimalScale);
        },

        /**
         * Меняет активный viewport и ширину холста.
         * При выходе из Figma mode с тем же viewport — восстанавливает сохранённые размеры.
         *
         * @param viewport - Новый viewport.
         */
        setViewport(viewport: 'mobile' | 'tablet' | 'desktop') {
            const wasInFigma = this.isFigmaMode;
            this.isViewportSwitching = true;
            this.isFigmaMode = false;
            this.activeViewport = null;

            // Если выходим из Figma mode с тем же viewport — восстанавливаем размеры
            if (wasInFigma && viewport === this.viewport && this._preFigmaWidth !== null) {
                this.width = this._preFigmaWidth;
                this.height = this._preFigmaHeight ?? VIEWPORT_BASE_HEIGHT[viewport];
                this._preFigmaWidth = null;
                this._preFigmaHeight = null;
            } else {
                this.viewport = viewport;

                const appConfig = useAppConfig() as any;
                const canvasBreakpoints = appConfig?.bricks?.breakpoints ?? {
                    mobile: { width: 375 },
                    tablet: { width: 768 },
                    desktop: { width: 1600 },
                };

                const widths = {
                    mobile: canvasBreakpoints.mobile?.width ?? 375,
                    tablet: canvasBreakpoints.tablet?.width ?? 768,
                    desktop: canvasBreakpoints.desktop?.width ?? 1600,
                };

                this.width = widths[viewport];

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
