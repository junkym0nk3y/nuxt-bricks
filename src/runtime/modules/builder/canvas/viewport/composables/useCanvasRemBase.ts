// #region Imports
// Types
import type { TBricksDeviceKey } from '../../../../common/types/brick';

// Vue
import { computed } from 'vue';

// Pinia
import { useCanvasStore } from '../../../core/stores/canvas';

// #endregion

/** Base rem value of the library (px) */
const LIBRARY_REM_BASE = 10;

/**
 * Computes the rem compensation for the canvas when the project uses a
 * non-standard html { font-size } (a vw-based one, for instance).
 *
 * The builder forces html { font-size: 10px } inline, and this composable
 * returns the factor the canvas scale has to be multiplied by for the content
 * to look the way it does on a published page.
 *
 * `remBase` is a property of the PROJECT device set (the `bricks.devices` module
 * option), not of a page: one page living in a different rem system from its
 * neighbors is not a setting but a breakage. The device-set resolver mixes it in
 * by matching key.
 *
 * @example
 * // nuxt.config.ts
 * bricks: {
 *     devices: [
 *         { key: 'mobile', label: 'Mobile', icon: 'device-mobile', width: 375, aside: 0.4 },
 *         { key: 'desktop', label: 'Desktop', icon: 'device-desktop', width: 1600, aside: 2,
 *           remBase: '0.6944vw' },
 *     ],
 * }
 */
export function useCanvasRemBase() {
    const canvasStore = useCanvasStore();

    /**
     * Computes the target rem (in px) for the given viewport from the remBase in the config.
     *
     * @param viewport - Device key of the project set.
     * @returns Target value of 1rem in pixels.
     */
    function computeTargetRemPx(viewport: TBricksDeviceKey): number {
        const device = canvasStore.devices.find((item) => item.key === viewport);

        if (!device) {
            return LIBRARY_REM_BASE;
        }

        const remBase = device.remBase ?? `${LIBRARY_REM_BASE}px`;

        if (remBase.endsWith('vw')) {
            const coefficient = parseFloat(remBase);

            if (Number.isNaN(coefficient)) {
                return LIBRARY_REM_BASE;
            }

            return (coefficient * device.width) / 100;
        }

        const parsed = parseFloat(remBase);
        return Number.isNaN(parsed) ? LIBRARY_REM_BASE : parsed;
    }

    /**
     * Rem compensation factor for the current viewport.
     * Multiplied into the canvas scale so the canvas matches a published page.
     *
     * With `remBase: '10px'` (the default) returns 1 — no compensation is needed.
     */
    const remCompensation = computed<number>(() => {
        return computeTargetRemPx(canvasStore.viewport) / LIBRARY_REM_BASE;
    });

    /**
     * Compensation for a specific viewport (used in Figma mode, where every
     * sheet of the device set is rendered at once).
     *
     * @param viewport - Device key of the project set.
     * @returns Compensation factor.
     */
    function getRemCompensation(viewport: TBricksDeviceKey): number {
        return computeTargetRemPx(viewport) / LIBRARY_REM_BASE;
    }

    return {
        remCompensation,
        getRemCompensation,
    };
}
