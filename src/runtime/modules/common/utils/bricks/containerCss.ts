// #region Imports
// Types
import type { IBricksResolvedDevice, TBricksResolvedDeviceSet } from '../../types/devices';

// Utils
import { buildDeviceMediaQuery, deviceRanges } from './devices';
// #endregion

/**
 * Returns the CSS properties of the container for a device.
 *
 * @param device - Resolved device of the set.
 * @param indent - Base indentation of the rule.
 * @returns Body of the `.bricks-container` rule.
 */
function buildContainerProps(device: IBricksResolvedDevice, indent: string): string {
    // The device width in px is the canvas sheet; the container values are stored
    // in rem as numbers, so that no string out of the database reaches the generated
    // CSS
    const maxWidth = device.maxWidth ?? device.width / 10;
    const lines = [`max-width: ${maxWidth}rem;`, `padding: 0 ${device.aside}rem;`];

    if (device.minWidth !== undefined) {
        lines.push(`min-width: ${device.minWidth}rem;`);
    }

    return lines.map((line) => `${indent}${line}`).join('\n');
}

/**
 * Assembles the CSS of the content container out of the device set.
 *
 * The canvas is addressed by the `data-bricks-viewport` attribute, a published page
 * by a media query over the ranges of the set. The ranges are computed from the
 * widths of the devices themselves, so a step cannot "be declared yet take no part
 * in the generation", the way it could with the former separate list of thresholds.
 *
 * @param devices - Resolved device set.
 * @returns CSS to inject into a `<style>`.
 */
export function buildBricksContainerCss(devices: TBricksResolvedDeviceSet): string {
    const ranges = deviceRanges(devices);

    const canvasRules = devices
        .map(
            (
                device
            ) => `        .bricks-canvas[data-bricks-viewport="${device.key}"] .bricks-container {
${buildContainerProps(device, '            ')}
        }`
        )
        .join('\n\n');

    const publishedRules = devices
        .map((device, index) => {
            const query = buildDeviceMediaQuery(ranges[index]);

            return `        ${query} {
            .bricks-container:where(:not(.bricks-canvas *)) {
${buildContainerProps(device, '                ')}
            }
        }`;
        })
        .join('\n\n');

    return `
        /* The canvas as a container for Container Queries */
        .bricks-canvas {
            container-type: inline-size;
            container-name: bricks;
        }

        /* Base styles of the content container (the canvas and a published page).
           box-sizing is set explicitly: the module does not rely on a global reset of
           the host project, otherwise width: 100% + padding (aside) pushes the
           container beyond the canvas */
        .bricks-container {
            box-sizing: border-box;
            width: 100%;
            margin: 0 auto;
        }

        /* Canvas: styles for the selected device of the set */
${canvasRules}

        /* Published page: the same values across the ranges of the set */
${publishedRules}`;
}
