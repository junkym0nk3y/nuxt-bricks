// #region Imports
// Types
import type {
    IBricksPageDevice,
    IBricksResolvedDevice,
    TBricksResolvedDeviceSet,
} from '../../types/devices';

// Constants
import {
    BRICKS_PAGE_ROOT_ATTRIBUTE,
    DEVICE_CATALOG,
    DEVICE_STEP_CONTAINER_PREFIX,
} from '../../constants/devices';

// Utils
import { buildDeviceMediaQuery, deviceRanges } from './devices';
// #endregion

/**
 * Name of the canvas sheet container. A brick written by hand against the canvas asks
 * for it as `@container bricks (…)`, so the name is never put on the page root.
 */
export const CANVAS_CONTAINER_NAME = 'bricks';

/**
 * The order of the catalog keys: it gives a place to a step the set does not have
 * (see `deviceStepContainerNames`)
 */
const CATALOG_ORDER: ReadonlyArray<string> = Object.keys(DEVICE_CATALOG);

/**
 * Finds the step of the set at which the boundary of every known key lies.
 *
 * A key of the set has its boundary at its own step. A catalog key the set does not
 * have becomes a step of zero width at its place in the catalog order: its boundary
 * is the first device of the set further along that order. So `bricks-up(tablet)` on
 * a set without a tablet means "from the next device of the page", and the boundary
 * always falls on a sheet of the page rather than on a width nobody sees. A key outside
 * the catalog that the set lacks has no place in that order and gets no boundary.
 *
 * @param devices - The set, sorted by ascending width.
 * @returns Key → index of the step its boundary lies at, ordered by that index.
 */
function deviceStepBoundaries(devices: ReadonlyArray<IBricksPageDevice>): Map<string, number> {
    const rankOf = (key: string): number => CATALOG_ORDER.indexOf(key);
    const entries: Array<[key: string, boundary: number]> = [];

    devices.forEach((device, index) => {
        const rank = rankOf(device.key);

        // The absent catalog keys right before this device take its step as their
        // boundary: it is the first one of the set further along the catalog order
        CATALOG_ORDER.forEach((key, keyRank) => {
            const isPlaced = entries.some(([placed]) => placed === key);
            const isInSet = devices.some((other) => other.key === key);

            if (!isPlaced && !isInSet && keyRank < rank) {
                entries.push([key, index]);
            }
        });

        entries.push([device.key, index]);
    });

    return new Map(entries);
}

/**
 * Lists the container names a step of the set carries.
 *
 * `bricks-up-<k>` for every key whose boundary is already passed at this step,
 * `bricks-down-<k>` for the rest, and `bricks-only-<k>` for the step's own key. The
 * mixins ask for a name instead of a width, so one compiled brick follows whatever set
 * the page has: the canvas sheet and the window range of the same device carry the
 * same names. A key the set does not have never gets `bricks-only-`: its step has zero
 * width.
 *
 * @param devices - The set, sorted by ascending width.
 * @param stepKey - Key of the step whose names are wanted.
 * @returns Names for `container-name`, or an empty list for a key outside the set.
 */
export function deviceStepContainerNames(
    devices: ReadonlyArray<IBricksPageDevice>,
    stepKey: string
): string[] {
    const step = devices.findIndex((device) => device.key === stepKey);

    if (step === -1) {
        return [];
    }

    const boundaries = [...deviceStepBoundaries(devices)].map(
        ([key, boundary]) =>
            `${boundary <= step ? DEVICE_STEP_CONTAINER_PREFIX.up : DEVICE_STEP_CONTAINER_PREFIX.down}${key}`
    );

    return [...boundaries, `${DEVICE_STEP_CONTAINER_PREFIX.only}${stepKey}`];
}

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
 * The same two addresses hand out the step names of the brick mixins
 * (`deviceStepContainerNames`): the canvas sheet gets the names of its device, the
 * root of a published page the names of the range the window falls into. The page
 * root does NOT get the `bricks` name: it is the name of a canvas sheet, and a brick
 * written by hand against `@container bricks (…)` relies on such a container existing
 * on a sheet only.
 *
 * @param devices - Resolved device set.
 * @returns CSS to inject into a `<style>`.
 */
export function buildBricksContainerCss(devices: TBricksResolvedDeviceSet): string {
    const ranges = deviceRanges(devices);
    const pageRoot = `[${BRICKS_PAGE_ROOT_ATTRIBUTE}]`;

    const canvasRules = devices
        .map((device) => {
            const names = [CANVAS_CONTAINER_NAME, ...deviceStepContainerNames(devices, device.key)];
            const sheet = `.bricks-canvas[data-bricks-viewport="${device.key}"]`;

            return `        ${sheet} {
            container-name: ${names.join(' ')};
        }

        ${sheet} .bricks-container {
${buildContainerProps(device, '            ')}
        }`;
        })
        .join('\n\n');

    const publishedRules = devices
        .map((device, index) => {
            const query = buildDeviceMediaQuery(ranges[index]);
            const names = deviceStepContainerNames(devices, device.key);

            return `        ${query} {
            ${pageRoot} {
                container-name: ${names.join(' ')};
            }

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
            container-name: ${CANVAS_CONTAINER_NAME};
        }

        /* The root of a published page: a container for the step names only.
           inline-size containment gives the root no intrinsic width of its own, so
           the root keeps an explicit width: 100% in the page component */
        ${pageRoot} {
            container-type: inline-size;
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

        /* Canvas: step names and styles for the selected device of the set */
${canvasRules}

        /* Published page: the same names and values across the ranges of the set */
${publishedRules}`;
}
