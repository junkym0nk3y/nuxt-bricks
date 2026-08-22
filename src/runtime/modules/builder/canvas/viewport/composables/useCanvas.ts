import { ref, computed, watch } from 'vue';
import { useCanvasStore } from '../../../core/stores/canvas';
import { useSidebarStore } from '../../../core/stores/sidebar';
import { convertRemToPx, convertPxToRem } from '../../../../common/utils/main';
import { useCanvasRemBase } from './useCanvasRemBase';

/**
 * Wrapper hook over the canvas store: ready-made methods for scale control,
 * container styles and the reaction to a window resize.
 *
 * @returns DOM refs, reactive styles and scaling methods.
 */
export function useCanvas() {
    const canvasStore = useCanvasStore();
    const sidebarStore = useSidebarStore();
    const { remCompensation, getRemCompensation } = useCanvasRemBase();
    const canvasContainer = ref<HTMLElement | null>(null);

    /** Gap between the sheets in Figma mode */
    const FIGMA_GAP_REM = '28rem';
    const FIGMA_GAP_PX = convertRemToPx(FIGMA_GAP_REM);

    /** Width of the vertical navigation rail */
    const VERTICAL_NAV_WIDTH_REM = '7.2rem';
    const VERTICAL_NAV_WIDTH_PX = convertRemToPx(VERTICAL_NAV_WIDTH_REM);

    /**
     * Visual width of the Figma mode content at scale = 1: every sheet of the set
     * with its rem compensation plus the gaps between them.
     *
     * Measured over the set, not over three hardcoded devices: a fourth sheet grows
     * the sum, and a fixed triple would leave the fit scale too high.
     */
    const getFigmaContentWidth = (): number => {
        const devices = canvasStore.devices;

        if (devices.length === 0) {
            return 0;
        }

        const sheets = devices.reduce(
            (total, device) => total + device.width * getRemCompensation(device.key),
            0
        );

        return sheets + FIGMA_GAP_PX * (devices.length - 1);
    };

    /**
     * Picks the fit scale from the width the window leaves free and the state of the
     * sidebars. In Figma mode the whole row of sheets has to fit, not a single sheet.
     *
     * @returns Recommended scale, never above 1.
     */
    const calculateOptimalScale = (): number => {
        if (typeof window === 'undefined') {
            return 1;
        }

        const leftWidth = sidebarStore.left.visible ? sidebarStore.left.width : 0;
        const rightWidth = sidebarStore.right.visible ? sidebarStore.right.width : 0;
        const padding = 80;
        const availableWidth =
            window.innerWidth -
            convertRemToPx(leftWidth) -
            convertRemToPx(rightWidth) -
            VERTICAL_NAV_WIDTH_PX -
            padding;

        if (canvasStore.isFigmaMode) {
            return Math.min(availableWidth / getFigmaContentWidth(), 1);
        }

        // Account for the rem compensation: the canvas is visually remCompensation times wider
        const effectiveWidth = canvasStore.width * remCompensation.value;
        const scaleX = availableWidth / effectiveWidth;
        return Math.min(scaleX, 1);
    };

    /**
     * Geometry signature of the device set: only what changes sheet sizes.
     *
     * The label and the glyph of a device stay out of it — otherwise typing a name in
     * the set editor would refit the canvas on every character. Dropping the manual
     * zoom is the store's business, and it skips a label-only edit for the same reason
     * (`setDevices`).
     */
    const devicesGeometry = computed(() =>
        canvasStore.devices.map((device) => `${device.key}:${device.width}`).join('|')
    );

    // Refit on a sidebar toggle, on Figma mode, on a viewport switch (rem compensation)
    // and on a geometry change of the device set.
    // A manual zoom (wheel or buttons) is never overwritten — auto-fit runs only while
    // !hasManualZoom. The store drops that flag itself, both on a viewport switch and on
    // a geometry change of the set.
    watch(
        () => [
            sidebarStore.left.visible,
            sidebarStore.right.visible,
            canvasStore.isFigmaMode,
            canvasStore.viewport,
            devicesGeometry.value,
        ],
        () => {
            if (canvasStore.hasManualZoom) {
                return;
            }
            const scale = calculateOptimalScale();
            canvasStore.setCanvasScale(scale);
        },
        { immediate: true }
    );

    // Canvas transform including the rem compensation (normal mode)
    const canvasTransform = computed(() => {
        const totalScale = canvasStore.scale * remCompensation.value;
        return `scale(${totalScale})`;
    });

    // Transform of the Figma mode wrapper — without the rem compensation, because every
    // viewport has its own (applied in BuilderCanvasViewport)
    const figmaBaseTransform = computed(() => {
        return `scale(${canvasStore.scale})`;
    });

    // The layout width of the canvas wrapper follows the visual scale: transform does
    // not affect layout, and without min-width a zoom above the fit scale would push the
    // left edge of the canvas outside the scroll area, where scrolling cannot reach it
    const canvasWrapperStyle = computed(() => {
        const totalScale = canvasStore.scale * remCompensation.value;
        return { minWidth: convertPxToRem(canvasStore.width * totalScale) };
    });

    // The same min-width for the Figma mode wrapper
    const figmaWrapperMinWidth = computed(() => {
        return convertPxToRem(getFigmaContentWidth() * canvasStore.scale);
    });

    // Styles of the canvas container relative to the sidebars (the left one and the
    // right properties panel)
    const canvasContainerStyle = computed(() => {
        const leftWidth = sidebarStore.left.visible ? sidebarStore.left.width : '0px';
        const rightWidth = sidebarStore.right.visible ? sidebarStore.right.width : '0px';
        const navWidth = VERTICAL_NAV_WIDTH_REM;

        return {
            marginLeft: sidebarStore.left.visible ? leftWidth : '0',
            width: `calc(100vw - ${leftWidth} - ${navWidth} - ${rightWidth})`,
            height: '100vh',
        };
    });

    /**
     * Window resize handler: recomputes the current scale.
     * Leaves a manual zoom of the user alone.
     */
    const handleResize = (): void => {
        if (canvasStore.hasManualZoom) {
            return;
        }
        const scale = calculateOptimalScale();
        canvasStore.setCanvasScale(scale);
    };

    /**
     * Returns the scale to the automatically picked value and clears the manual zoom
     * flag.
     */
    const resetZoom = (): void => {
        canvasStore.hasManualZoom = false;
        const scale = calculateOptimalScale();
        canvasStore.setCanvasScale(scale);
    };

    return {
        canvasContainer,
        canvasTransform,
        figmaBaseTransform,
        canvasContainerStyle,
        canvasWrapperStyle,
        figmaWrapperMinWidth,
        figmaGap: FIGMA_GAP_REM,
        remCompensation,
        getRemCompensation,
        handleResize,
        resetZoom,
        calculateOptimalScale,
    };
}
