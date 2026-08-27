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
import { VIEWPORT_SWITCH_SETTLE_MS } from '../constants/canvas';
import { resolveContentDrivenCanvasHeight } from '../utils/canvasHeight';

/** Resting state of a transient drag session: the single source of the defaults */
const IDLE_DRAG_STATE: ICanvasDragState = {
    source: null,
    componentId: null,
    width: 0,
    height: 0,
    isFullWidth: false,
    sourceVacated: false,
};

/**
 * Signature of a device set, for comparing two sets by meaning.
 *
 * It carries only what the canvas geometry depends on: the keys, the sheet widths
 * and heights, and the rem base. The label and the glyph of a device are left out
 * deliberately — otherwise typing a name in the set editor would reset the manual
 * zoom on every character.
 *
 * @param devices - Device set.
 * @returns The signature string.
 */
function getDevicesSignature(devices: TBricksResolvedDeviceSet): string {
    return devices
        .map((device) => `${device.key}:${device.width}:${device.canvasHeight}:${device.remBase}`)
        .join('|');
}

/**
 * Owns the sizing of the canvas: width, height, scale and the current viewport.
 * It backs the canvas setup calculations and keeps them in step with the real size
 * of the content.
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
        dragState: { ...IDLE_DRAG_STATE },
        _preFigmaWidth: null,
        _preFigmaHeight: null,
        _viewportSwitchGeneration: 0,
    }),

    getters: {
        /**
         * Signature of the device set currently held by the store.
         *
         * Published because the canvas refits on a geometry change and must compare the
         * set by the same measure the store uses: a local signature narrower than this
         * one (keys and widths alone) left a new rem base out, and the sheet kept the
         * fit computed for the previous geometry.
         *
         * @param state - Store state.
         */
        devicesSignature(state): string {
            return getDevicesSignature(state.devices);
        },
    },

    actions: {
        /**
         * Replaces the device set of the canvas with the set of the page.
         *
         * State only: recomputing the scale lives in `useCanvas` — it reads the window
         * size and the sidebars, which the state core cannot see from the canvas
         * domain. After the set changes, the canvas recomputes its own geometry by
         * watching the signature of the set.
         *
         * A repeat call with the same set still stores it, so an edited label or glyph
         * reaches the interface, but skips the geometry and the manual zoom below —
         * otherwise typing a name would make the sizes jump on every character.
         *
         * @param devices - Resolved device set of the page.
         */
        setDevices(devices: TBricksResolvedDeviceSet) {
            if (this.devicesSignature === getDevicesSignature(devices)) {
                this.devices = devices;
                return;
            }

            this.devices = devices;

            // The active device may have been dropped from the set: without moving to
            // the base one the canvas would sit on a key the set does not carry, and
            // there would be nowhere to read its width from
            if (!devices.some((device) => device.key === this.viewport)) {
                this.viewport = BASE_DEVICE_KEY;
            }

            if (this.activeViewport && !devices.some((d) => d.key === this.activeViewport)) {
                this.activeViewport = null;
            }

            // The sheet sizes taken before entering Figma mode were measured against
            // the previous set
            this._preFigmaWidth = null;
            this._preFigmaHeight = null;

            // The manual zoom is dropped, just as it is on a device switch: it was
            // picked for the previous sheet sizes, and auto-fit will not run while it
            // stands — the row of sheets in Figma mode, or a sheet that grew wider,
            // would stay clipped until someone intervened. Below the early return on
            // purpose: editing a label or a glyph changes no geometry and leaves the
            // zoom alone
            this.hasManualZoom = false;

            this.width = this.getViewportWidth(this.viewport);
            this.height = this.getViewportHeight(this.viewport);
        },

        /**
         * Sheet width of a device in the set.
         *
         * @param viewport - Device key.
         * @returns Width in px.
         */
        getViewportWidth(viewport: TBricksDeviceKey): number {
            const device = this.devices.find((item) => item.key === viewport);
            return device?.width ?? this.devices.at(-1)?.width ?? 1600;
        },

        /**
         * Base sheet height of a device in the set.
         *
         * @param viewport - Device key.
         * @returns Height in px.
         */
        getViewportHeight(viewport: TBricksDeviceKey): number {
            const device = this.devices.find((item) => item.key === viewport);
            return device?.canvasHeight ?? DEFAULT_CANVAS_HEIGHT;
        },

        /**
         * Brings the canvas sizes in step with the set for the current viewport.
         * Called when the builder initializes: the state default (1920) may differ from
         * the width of the device the set declares.
         */
        initCanvasSize() {
            this.width = this.getViewportWidth(this.viewport);
            this.height = this.getViewportHeight(this.viewport);
        },

        /**
         * Sets the canvas scale, clamped to [0.1, 4].
         *
         * @param scale - New scale value.
         */
        setCanvasScale(scale: number) {
            this.scale = Math.max(MIN_CANVAS_SCALE, Math.min(MAX_CANVAS_SCALE, scale));
        },

        /**
         * Sets the scale as a manual one (wheel or buttons) — auto-fit will not
         * overwrite it.
         *
         * @param scale - New scale value.
         */
        setManualCanvasScale(scale: number) {
            this.hasManualZoom = true;
            this.setCanvasScale(scale);
        },

        /**
         * Opens the window during which the canvas counts as switching viewports, and
         * closes it once the sheet has settled.
         *
         * The generation is what makes the flag trustworthy: two switches inside one
         * window would otherwise have the timer of the first one clear the flag of the
         * second, and every surface waiting for the switch (the inline editor, the
         * scroll of the schema tree) would aim at geometry still on the move.
         */
        beginViewportSwitch() {
            this.isViewportSwitching = true;
            const generation = ++this._viewportSwitchGeneration;

            setTimeout(() => {
                if (this._viewportSwitchGeneration === generation) {
                    this.isViewportSwitching = false;
                }
            }, VIEWPORT_SWITCH_SETTLE_MS);
        },

        /**
         * Switches the active viewport and the canvas width.
         * Leaving Figma mode on the same viewport restores the stored sizes.
         *
         * @param viewport - New viewport.
         */
        setViewport(viewport: TBricksDeviceKey) {
            const wasInFigma = this.isFigmaMode;
            this.beginViewportSwitch();
            this.isFigmaMode = false;
            this.activeViewport = null;
            this.hasManualZoom = false;

            // Leaving Figma mode on the same viewport: the sizes are restored
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
        },

        /**
         * Toggles Figma mode, which shows every viewport of the set side by side.
         * Entering stores the current sizes, leaving restores them.
         */
        toggleFigmaMode() {
            this.beginViewportSwitch();

            if (!this.isFigmaMode) {
                // Entering Figma mode: the current sizes are stored
                this._preFigmaWidth = this.width;
                this._preFigmaHeight = this.height;
            } else {
                // Leaving Figma mode: the sizes are restored
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
        },

        /**
         * Toggles the visual grid of the layout components.
         */
        toggleGrid() {
            this.showGrid = !this.showGrid;
        },

        /**
         * Starts a transient drag session without touching the component tree.
         *
         * @param payload - The source and the real size of the placeholder to come.
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
         * Takes the original out of the flow once the native drag has already started.
         * Called deferred (rAF or timeout) — a synchronous display:none would cancel
         * the drag.
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
         * Finishes or cancels the drag session, restoring the original render.
         */
        finishCanvasDrag() {
            this.dragState = { ...IDLE_DRAG_STATE };
        },

        /**
         * Brings the canvas height in step with the real content.
         *
         * @param contentHeight - Height of the canvas content in px.
         * @param hasComponents - Whether the canvas holds any components.
         */
        syncCanvasHeightWithContent(contentHeight: number, hasComponents: boolean) {
            const targetHeight = resolveContentDrivenCanvasHeight(
                this.getViewportHeight(this.viewport),
                contentHeight,
                hasComponents
            );

            // A write of the same height is not free here: `height` feeds the geometry
            // guard that silences the flow transitions, so a sub-pixel jitter of the
            // measurement would keep waking it up
            if (Math.abs(this.height - targetHeight) > 1) {
                this.height = targetHeight;
            }
        },
    },
});
