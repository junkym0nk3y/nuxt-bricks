// #region Imports
// Types
import type { TBricksResolvedDeviceSet } from '../../common/types/devices';

// Utils
import { buildDeviceMediaQuery, deviceRanges } from '../../common/utils/bricks/devices';
// #endregion

/**
 * Assembles the per-device hiding rules for a device set.
 *
 * `display: none !important` is a deliberate exception to the ban on `!important`
 * (`.claude/rules/styles.md`): the visibility class competes with the INLINE `display`
 * of the container blocks (Grid, Flex and Section put it into the element `style` when
 * they render), and without `!important` hiding would silently stop working for them.
 * The ban was written for component styles; this is generated global utility CSS.
 *
 * @param devices - Resolved device set.
 * @returns CSS to inject into a `<style>`.
 */
export function buildDeviceVisibilityCss(devices: TBricksResolvedDeviceSet): string {
    const canvasSelectors = devices
        .map(
            (device) =>
                `        .bricks-canvas[data-bricks-viewport="${device.key}"] .bricks-hide--${device.key}`
        )
        .join(',\n');

    const publishedRules = deviceRanges(devices)
        .map((range) => {
            const query = buildDeviceMediaQuery(range);

            return `        ${query} {
            .bricks-hide--${range.key}:not(.bricks-canvas *) { display: none !important; }
        }`;
        })
        .join('\n\n');

    return `
        /* ===== Device visibility: Builder (canvas viewport) ===== */
${canvasSelectors} {
            display: none !important;
        }

        /* ===== Device visibility: Published (real viewport) ===== */
        /* On a published page the components are hidden outright by media queries. */
${publishedRules}
    `;
}
