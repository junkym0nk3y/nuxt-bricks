// #region Imports
// Types
import type { IUseBricksDevicesReturn } from '../types/composables';
import type { TBricksProjectDeviceSet, TBricksResolvedDeviceSet } from '../types/devices';

// Nuxt
import { useRuntimeConfig } from 'nuxt/app';

// Constants
import { DEFAULT_BRICKS_DEVICES } from '../constants/devices';

// Utils
import { deviceRanges, resolveDeviceSet, validateDeviceSet } from '../utils/bricks/devices';
// #endregion

/**
 * The warning about a substituted set is printed once per application load: the
 * resolver is called from a `computed`, and printing on every recomputation would
 * turn the output into a stream. The diagnostics are needed as a fact, not as a
 * counter.
 */
let hasWarnedInvalidPageDevices = false;

/**
 * The project device set and the resolver of a page set.
 *
 * The project set is fixed at build time (the `bricks.devices` module option on top
 * of the constant) and arrives in `runtimeConfig.public`: the same numbers go into
 * the SCSS map of the mixins, so the canvas, the containers, the published
 * thresholds and the media queries of brick authors are all computed from one
 * source.
 *
 * This composable does not read the page set — only whoever loaded the page knows
 * it, and they pass the config into `resolvePageDevices` themselves.
 */
export function useBricksDevices(): IUseBricksDevicesReturn {
    const runtimeConfig = useRuntimeConfig();
    const raw = runtimeConfig.public?.bricksDevices;

    // The option is validated fail-fast when the module is built; the check here is
    // needed in case runtimeConfig was overridden bypassing it
    const validation = validateDeviceSet(raw, 'project');
    const projectDevices: TBricksProjectDeviceSet = validation.ok
        ? (raw as TBricksProjectDeviceSet)
        : DEFAULT_BRICKS_DEVICES;

    const project = resolveDeviceSet(null, projectDevices);

    /**
     * Resolves the set of a particular page on top of the project one.
     *
     * @param pageConfig - The `viewport_config` of the page, or `null` (inheritance).
     * @returns The resolved device set.
     */
    function resolvePageDevices(pageConfig: unknown): TBricksResolvedDeviceSet {
        const resolved = resolveDeviceSet(pageConfig, projectDevices);

        // Silently returning the project set instead of a corrupted one is not
        // allowed: the page will show up in a layout not its own, and the only trace
        // will stay in the database row. The raw value is not written into the log —
        // it is page data
        if (resolved.usedFallback && !hasWarnedInvalidPageDevices) {
            hasWarnedInvalidPageDevices = true;
            console.warn(
                '[Bricks] The device set of the page does not pass the contract — the page was rendered with the project set. Check bricks_pages.viewport_config.'
            );
        }

        return resolved.devices;
    }

    return {
        projectDevices: project.devices,
        resolvePageDevices,
        deviceRanges,
    };
}
