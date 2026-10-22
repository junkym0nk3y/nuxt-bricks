// #region Imports
// Types
import type { IBricksComponent, IBricksSchema } from '../../../common/types/brick';

// Utils
import { hasOwnKey } from '../../../common/utils/safeRecord';
import {
    findRemovedDeviceKeys,
    stripDeviceKeysFromSchema,
} from '../../core/utils/deviceKeyCleanup';
// #endregion

/**
 * Counts the property overrides of the blocks bound to a device.
 *
 * It is the overrides that are counted rather than the blocks: the confirmation
 * promises to remove "the property overrides ... there are N of them right now",
 * and the number of blocks would name a different quantity to a person. The
 * visibility flag is a device override too: it disappears along with the key.
 *
 * @param components - Components of the page schema.
 * @param deviceKey - Key of the device being removed.
 * @returns The number of values that will disappear.
 */
export function countDeviceOverrides(
    components: ReadonlyArray<IBricksComponent>,
    deviceKey: string
): number {
    return components.reduce((total, component) => {
        const responsive = (component.props as Record<string, unknown> | undefined)?.responsive;
        const overrides =
            responsive && typeof responsive === 'object' && hasOwnKey(responsive, deviceKey)
                ? (responsive as Record<string, unknown>)[deviceKey]
                : undefined;

        const propsCount =
            overrides && typeof overrides === 'object'
                ? Object.keys(overrides as Record<string, unknown>).length
                : 0;

        const visibilityCount =
            component.deviceVisibility && hasOwnKey(component.deviceVisibility, deviceKey) ? 1 : 0;

        return total + propsCount + visibilityCount;
    }, 0);
}

/**
 * Describes which device the range of the removed one goes to.
 *
 * The range does not go anywhere — the narrower neighbor takes it over (the
 * narrowest device has no such neighbor, but the edge devices are not removable
 * either). That is exactly what a person needs to see: the layout of the removed
 * step does not disappear, it merges with the neighboring one.
 *
 * @param devices - The set, sorted by ascending width.
 * @param deviceKey - Key of the device being removed.
 * @returns The label of the receiving device and the range moving over to it.
 */
export function describeAbsorbedRange(
    devices: ReadonlyArray<{ key: string; label: string; width: number }>,
    deviceKey: string
): { label: string; range: string } {
    const index = devices.findIndex((device) => device.key === deviceKey);

    if (index <= 0) {
        return { label: '', range: '' };
    }

    const next = devices[index + 1];
    const upper = next ? next.width - 1 : null;

    return {
        label: devices[index - 1].label,
        range: upper === null ? `${devices[index].width}+` : `${devices[index].width}–${upper}`,
    };
}

/**
 * Brings a schema to a new device set: strips the keys of the devices that are
 * gone.
 *
 * Needed where the schema is not in the builder store yet but sits in the page
 * creation form: the watcher of the composition root cleans up the open page only,
 * while the removal confirmation promises to remove the overrides of the device at
 * the moment of a creation too. Without this the page would be created carrying
 * exactly what was promised to be removed.
 *
 * The schema comes back by the same reference when there is nothing to remove —
 * the caller does not have to guess whether anything changed.
 *
 * @param schema - The schema that will travel into the page being created.
 * @param previousKeys - Keys of the set before the edit.
 * @param nextKeys - Keys of the set after the edit.
 * @returns The schema without the keys of the devices that are gone.
 */
export function applyDeviceSetToSchema(
    schema: IBricksSchema,
    previousKeys: ReadonlyArray<string>,
    nextKeys: ReadonlyArray<string>
): IBricksSchema {
    const removed = findRemovedDeviceKeys(previousKeys, nextKeys);

    return removed.size > 0 ? stripDeviceKeysFromSchema(schema, removed) : schema;
}

/**
 * Collects the device keys that occur in the schema but are absent from the set.
 *
 * Such overrides are not removed — there must be no silent loss of data — but they
 * are not applied either: no CSS rules are generated for them. A person is told
 * that outright, because otherwise the divergence of the layout looks like a bug
 * of the renderer.
 *
 * There is nowhere to automatically map a foreign key onto a device of our own:
 * `watch` or `screen-2` may mean anything, so no remapping is done.
 *
 * The counting has to run against the ACTUAL set of the target rather than the set
 * of the file: a file may say nothing about a set at all, and then the steps are
 * dictated by the page being imported into.
 *
 * @param components - Components of the schema.
 * @param deviceKeys - Device keys of the set that is going to apply.
 * @returns The sorted unique orphan keys.
 */
export function collectOrphanDeviceKeys(
    components: ReadonlyArray<IBricksComponent>,
    deviceKeys: ReadonlyArray<string>
): string[] {
    const known = new Set(deviceKeys);
    const orphans = new Set<string>();

    for (const component of components) {
        const responsive = (component.props as Record<string, unknown> | undefined)?.responsive;

        if (responsive && typeof responsive === 'object') {
            for (const key of Object.keys(responsive)) {
                if (!known.has(key)) {
                    orphans.add(key);
                }
            }
        }

        for (const key of Object.keys(component.deviceVisibility ?? {})) {
            if (!known.has(key)) {
                orphans.add(key);
            }
        }
    }

    return [...orphans].sort();
}
