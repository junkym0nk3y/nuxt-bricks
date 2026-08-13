import { defineStore } from 'pinia';
import type {
    ICanvasDragState,
    ICanvasDragStartPayload,
    ICanvasState,
    TBricksDeviceKey,
} from '../../../common/types/brick';
import type { TBricksResolvedDeviceSet } from '../../../common/types/devices';
import { BASE_DEVICE_KEY, DEFAULT_CANVAS_HEIGHT } from '../../../common/constants/devices';
import { MIN_CANVAS_SCALE, MAX_CANVAS_SCALE } from '../constants/canvasScale';

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
 * Сигнатура набора для семантического сравнения.
 *
 * В неё входит только то, от чего зависит геометрия канваса: ключи, ширины и
 * высоты листов. Подпись и глиф устройства сюда не входят намеренно — иначе
 * ввод имени в редакторе набора сбрасывал бы ручной зум на каждый символ.
 *
 * @param devices - Набор устройств.
 * @returns Строковая сигнатура.
 */
function getDevicesSignature(devices: TBricksResolvedDeviceSet): string {
    return devices
        .map((device) => `${device.key}:${device.width}:${device.canvasHeight}:${device.remBase}`)
        .join('|');
}

/**
 * Инкапсулирует логику размеров холста: ширину, высоту, масштаб и текущий viewport.
 * Используется для расчёта настройки канваса и синхронизации с реальными размерами контента.
 */
export const useCanvasStore = defineStore('bricksCanvas', {
    state: (): ICanvasState => ({
        devices: [],
        width: 1920,
        height: DEFAULT_CANVAS_HEIGHT,
        scale: 1,
        viewport: BASE_DEVICE_KEY,
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
         * Заменяет набор устройств канваса набором страницы.
         *
         * Только состояние: пересчёт масштаба живёт в `useCanvas` — он читает
         * размер окна и сайдбары, а ядро состояния канвас-домена не видит.
         * Геометрию после смены набора пересчитывает сам канвас, следя за
         * сигнатурой набора.
         *
         * Идемпотентен: повторный вызов с тем же набором ничего не делает, —
         * иначе правка подписи устройства дёргала бы размеры на каждый символ.
         *
         * @param devices - Резолвнутый набор устройств страницы.
         */
        setDevices(devices: TBricksResolvedDeviceSet) {
            if (getDevicesSignature(this.devices) === getDevicesSignature(devices)) {
                this.devices = devices;
                return;
            }

            this.devices = devices;

            // Активное устройство могли удалить из набора: без переезда на
            // базовое канвас остался бы на ключе, которого в наборе нет, и
            // ширину для него взять было бы неоткуда
            if (!devices.some((device) => device.key === this.viewport)) {
                this.viewport = BASE_DEVICE_KEY;
            }

            if (this.activeViewport && !devices.some((d) => d.key === this.activeViewport)) {
                this.activeViewport = null;
            }

            // Размеры листа до входа в Figma mode считались по прежнему набору
            this._preFigmaWidth = null;
            this._preFigmaHeight = null;

            // Ручной зум снимается, как и при смене устройства: он подобран под
            // прежние размеры листа, и с ним авто-фит не сработает — четыре листа
            // в Figma-режиме или ставший шире лист остались бы обрезанными до
            // ручного вмешательства. Ниже раннего выхода намеренно: правка
            // подписи или глифа геометрию не меняет и зум не трогает
            this.hasManualZoom = false;

            this.width = this.getViewportWidth(this.viewport);
            this.height = this.getViewportHeight(this.viewport);
        },

        /**
         * Ширина листа для устройства набора.
         *
         * @param viewport - Ключ устройства.
         * @returns Ширина в px.
         */
        getViewportWidth(viewport: TBricksDeviceKey): number {
            const device = this.devices.find((item) => item.key === viewport);
            return device?.width ?? this.devices.at(-1)?.width ?? 1600;
        },

        /**
         * Базовая высота листа для устройства набора.
         *
         * @param viewport - Ключ устройства.
         * @returns Высота в px.
         */
        getViewportHeight(viewport: TBricksDeviceKey): number {
            const device = this.devices.find((item) => item.key === viewport);
            return device?.canvasHeight ?? DEFAULT_CANVAS_HEIGHT;
        },

        /**
         * Синхронизирует размеры холста с набором для текущего viewport.
         * Вызывается при инициализации билдера: дефолт state (1920) может
         * не совпадать с шириной устройства из набора.
         */
        initCanvasSize() {
            this.width = this.getViewportWidth(this.viewport);
            this.height = this.getViewportHeight(this.viewport);
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
                this.height = this._preFigmaHeight ?? this.getViewportHeight(viewport);
                this._preFigmaWidth = null;
                this._preFigmaHeight = null;
            } else {
                this.viewport = viewport;
                this.width = this.getViewportWidth(viewport);
                this.height = this.getViewportHeight(viewport);

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
            const baseHeight = this.getViewportHeight(this.viewport);

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
