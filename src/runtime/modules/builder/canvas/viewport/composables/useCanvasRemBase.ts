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
 * Turns a target rem into the compensation factor, with no compensation for a rem that
 * cannot be one. The device validator checks only that `remBase` is a string, so `0px`,
 * `-1px` or `Infinitypx` reach here; the factor multiplies the sheet height and divides
 * the width of its content, and such a value collapsed the sheet to nothing or blew it
 * up to infinity.
 *
 * @param targetRemPx - Target value of 1rem in pixels.
 * @returns Positive finite factor, 1 when the rem is unusable.
 */
function toCompensation(targetRemPx: number): number {
    const factor = targetRemPx / LIBRARY_REM_BASE;

    return Number.isFinite(factor) && factor > 0 ? factor : 1;
}

/**
 * Style of the sheet content under a rem compensation: the content is laid out
 * `1 / compensation` times as wide as the sheet and scaled back to its width.
 *
 * The builder forces `html { font-size: 10px }`, while a project may set another rem —
 * `0.6944vw` is 7.11px at a laptop of 1024px, and the page there is 144rem wide. The
 * compensation used to scale the whole sheet: the sheet shrank, its layout stayed 102.4rem
 * wide, and a layout drawn for 144rem broke on the canvas only — columns squeezed, lines
 * wrapped. Widening the sheet itself to 1440px is no way out: the container queries of the
 * canvas (`bricks-up(laptop)`) measure the sheet in px and would see a desktop. So the
 * sheet keeps the width of its device and stays the query container, and the content
 * inside it gets the width of the page in rem.
 *
 * A transform, not CSS `zoom`, which would need no width: Firefox below 126 — inside the
 * browserslist of the module — ignores `zoom`, and the compensation would be lost there.
 * Under a transform the layout measurements of the content (`scrollHeight`, `offsetWidth`)
 * stay in its own px in every browser, so the sheet takes the measured height times the
 * compensation.
 *
 * @param compensation - Rem compensation factor of the sheet.
 * @returns Inline style of the content, or `undefined` at a compensation of 1.
 */
export function getRemCompensationStyle(compensation: number): Record<string, string> | undefined {
    if (compensation === 1 || !Number.isFinite(compensation) || compensation <= 0) {
        return undefined;
    }

    return {
        width: `${100 / compensation}%`,
        transform: `scale(${compensation})`,
        transformOrigin: 'top left',
    };
}

/**
 * Computes the rem compensation for the canvas when the project uses a
 * non-standard html { font-size } (a vw-based one, for instance).
 *
 * The builder forces html { font-size: 10px } inline, and this composable
 * returns the scale of the sheet content that brings one rem to the rem of a
 * published page — the sheet itself keeps the width of its device (see
 * `getRemCompensationStyle`).
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
     * Rem compensation factor for the current viewport: the scale of the sheet content
     * under which the canvas matches a published page.
     *
     * With `remBase: '10px'` (the default) returns 1 — no compensation is needed.
     */
    const remCompensation = computed<number>(() => {
        return toCompensation(computeTargetRemPx(canvasStore.viewport));
    });

    /**
     * Compensation for a specific viewport (used in Figma mode, where every
     * sheet of the device set is rendered at once).
     *
     * @param viewport - Device key of the project set.
     * @returns Compensation factor.
     */
    function getRemCompensation(viewport: TBricksDeviceKey): number {
        return toCompensation(computeTargetRemPx(viewport));
    }

    return {
        remCompensation,
        getRemCompensation,
    };
}
