import type { IDeviceVisibilityConfig } from '../../types/brick';
import { BASE_DEVICE_KEY, DEVICE_KEY_PATTERN } from '../../constants/devices';

/**
 * Normalizes the per-device visibility configuration.
 *
 * A missing key means "visible", so the normalization merely coerces the values
 * that are already there into booleans and drops the garbage. Filling in the
 * missing keys with a `true` value is not allowed: pages have different device
 * sets, and such a normalization would return the keys of just-deleted devices into
 * the schema on every deserialization — quietly accumulating data about steps that
 * do not exist.
 *
 * @param value - Partial visibility configuration.
 * @returns A configuration made of the explicitly set flags only.
 */
export function normalizeDeviceVisibility(
    value: Partial<IDeviceVisibilityConfig> | null | undefined
): IDeviceVisibilityConfig {
    if (!value || typeof value !== 'object') {
        return {};
    }

    // The values are coerced into booleans rather than dropped by type: a schema is
    // external data, and a `0` in it means "hidden" rather than "the field is unset"
    return Object.fromEntries(
        Object.entries(value)
            .filter(([, flag]) => flag !== undefined && flag !== null)
            .map(([key, flag]) => [key, Boolean(flag)])
    );
}

/**
 * Returns the list of CSS classes that hide a component on the given devices.
 *
 * The device set is not needed here: the classes are built out of the explicit
 * `false` values only, and which keys are active is decided by the generated CSS
 * (there are rules for the devices of the page set only, so an orphaned class
 * affects nothing).
 *
 * The key is checked against the name contract: it travels into a class NAME, while
 * a schema is external data. The key `x bricks-hide--desktop` would give the element
 * two classes, the second of which is a real hiding rule, that is, a foreign row in
 * the database or an imported file could impose an arbitrary global class on the
 * element. An orphaned but syntactically valid key (`laptop` outside the set) is
 * kept — what is filtered out is garbage, not the absence of a key from the set.
 *
 * @param value - Per-device visibility configuration.
 * @returns Classes shaped as `bricks-hide--<device key>`.
 */
export function buildDeviceVisibilityClasses(
    value: Partial<IDeviceVisibilityConfig> | null | undefined
): string[] {
    return Object.entries(normalizeDeviceVisibility(value))
        .filter(([key, isVisible]) => !isVisible && DEVICE_KEY_PATTERN.test(key))
        .map(([key]) => `bricks-hide--${key}`);
}

/**
 * Decides whether the component has to be marked as `aria-hidden="true"`.
 *
 * The base device counts as the canonical version for SEO — components hidden on it
 * are marked as duplicates.
 *
 * @param value - Per-device visibility configuration.
 * @returns true — the component is hidden on the base device.
 */
export function shouldAriaHideComponent(
    value: Partial<IDeviceVisibilityConfig> | null | undefined
): boolean {
    return normalizeDeviceVisibility(value)[BASE_DEVICE_KEY] === false;
}
