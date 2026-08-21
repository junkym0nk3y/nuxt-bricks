// #region Imports
// Types
import type {
    IBricksDeviceRange,
    IBricksPageDevice,
    IBricksProjectDevice,
    IBricksResolvedDevice,
    TBricksDeviceSetValidation,
    TBricksPageDeviceSet,
    TBricksProjectDeviceSet,
    TBricksResolvedDeviceSet,
} from '../../types/devices';

// Constants
import {
    BASE_DEVICE_KEY,
    BASE_VAR_SUFFIX,
    DEFAULT_CANVAS_HEIGHT,
    DEFAULT_REM_BASE,
    DEVICE_CATALOG,
    DEVICE_ICON_CHOICES,
    DEVICE_ICON_PREFIX,
    DEVICE_KEY_PATTERN,
    DEVICE_MAX_WIDTH,
    DEVICE_MIN_WIDTH,
    DEVICE_REM_MAX,
    DEVICE_REM_STEP,
    DEVICE_SET_MAX,
    DEVICE_SET_MIN,
    NARROW_DEVICE_KEY,
    REQUIRED_DEVICE_KEYS,
} from '../../constants/devices';
// #endregion

// #region Constants
/** Fields of a device entry a page knows about. Anything else is a rejection */
const PAGE_DEVICE_KEYS = new Set([
    'key',
    'label',
    'icon',
    'width',
    'aside',
    'maxWidth',
    'minWidth',
]);

/**
 * Fields of a project device. `remBase` exists here only: a non-standard rem base
 * is a property of the whole project, and editing it per page would mean one page
 * living in a different rem system than its neighbors.
 */
const PROJECT_DEVICE_KEYS = new Set([...PAGE_DEVICE_KEYS, 'remBase']);

const ICON_CHOICES = new Set<string>(DEVICE_ICON_CHOICES);

/** Tolerance for comparing rem values against the step: 0.1 + 0.2 in double gives 0.30000000000000004 */
const REM_STEP_EPSILON = 1e-6;
// #endregion

// #region Validation
/**
 * Checks that the value is an integer within the bounds.
 *
 * @param value - Value being checked.
 * @param min - Lower bound, inclusive.
 * @param max - Upper bound, inclusive.
 * @returns true if the value fits.
 */
function isIntegerInRange(value: unknown, min: number, max: number): boolean {
    return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/**
 * Checks a rem value: a non-negative finite number up to the ceiling and a
 * multiple of the 0.2 step.
 *
 * @param value - Value being checked.
 * @returns true if the value fits.
 */
function isRemValue(value: unknown): boolean {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        return false;
    }

    if (value > DEVICE_REM_MAX) {
        return false;
    }

    const steps = value / DEVICE_REM_STEP;
    return Math.abs(steps - Math.round(steps)) < REM_STEP_EPSILON;
}

/**
 * Checks a single device entry.
 *
 * @param raw - Raw entry.
 * @param index - Position in the set (for the error text).
 * @param errors - Accumulator of rejection reasons.
 * @param allowedFields - Fields allowed in the entry (page or project).
 * @returns The normalized entry or null.
 */
// eslint-disable-next-line complexity
function validateDevice(
    raw: unknown,
    index: number,
    errors: string[],
    allowedFields: ReadonlySet<string>
): IBricksPageDevice | null {
    const at = `devices[${index}]`;

    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        errors.push(`${at} must be an object`);
        return null;
    }

    const record = raw as Record<string, unknown>;

    for (const key of Object.keys(record)) {
        if (!allowedFields.has(key)) {
            errors.push(`${at} has unknown field "${key}"`);
            return null;
        }
    }

    if (record.remBase !== undefined && typeof record.remBase !== 'string') {
        errors.push(`${at}.remBase must be a string`);
        return null;
    }

    const { key, label, icon, width, aside, maxWidth, minWidth } = record;

    if (typeof key !== 'string' || !DEVICE_KEY_PATTERN.test(key)) {
        errors.push(`${at}.key must match ${String(DEVICE_KEY_PATTERN)}`);
        return null;
    }

    // The `base` key is taken by the suffix of the base value of the responsive
    // variables: a device with such a key would overwrite the default of every
    // block at once
    if (key === BASE_VAR_SUFFIX) {
        errors.push(`${at}.key "${BASE_VAR_SUFFIX}" is reserved`);
        return null;
    }

    if (typeof label !== 'string' || label.trim().length === 0) {
        errors.push(`${at}.label is required`);
        return null;
    }

    if (typeof icon !== 'string' || !ICON_CHOICES.has(icon)) {
        errors.push(`${at}.icon must be one of the allowed device glyphs`);
        return null;
    }

    if (!isIntegerInRange(width, DEVICE_MIN_WIDTH, DEVICE_MAX_WIDTH)) {
        errors.push(`${at}.width must be an integer in [${DEVICE_MIN_WIDTH}, ${DEVICE_MAX_WIDTH}]`);
        return null;
    }

    if (!isRemValue(aside)) {
        errors.push(`${at}.aside must be a non-negative rem value with step ${DEVICE_REM_STEP}`);
        return null;
    }

    if (maxWidth !== undefined && !isRemValue(maxWidth)) {
        errors.push(`${at}.maxWidth must be a non-negative rem value with step ${DEVICE_REM_STEP}`);
        return null;
    }

    if (minWidth !== undefined && !isRemValue(minWidth)) {
        errors.push(`${at}.minWidth must be a non-negative rem value with step ${DEVICE_REM_STEP}`);
        return null;
    }

    return {
        key,
        label: label.trim(),
        icon,
        width: width as number,
        aside: aside as number,
        ...(maxWidth === undefined ? {} : { maxWidth: maxWidth as number }),
        ...(minWidth === undefined ? {} : { minWidth: minWidth as number }),
    };
}

/**
 * Checks the shape of the whole set: its length, uniqueness, order and the
 * outermost devices.
 *
 * @param devices - Entries already checked one by one.
 * @param errors - Accumulator of rejection reasons.
 */
function validateSetShape(devices: TBricksPageDeviceSet, errors: string[]): void {
    const keys = new Set<string>();
    const widths = new Set<number>();

    for (const device of devices) {
        if (keys.has(device.key)) {
            errors.push(`duplicate device key "${device.key}"`);
        }
        if (widths.has(device.width)) {
            errors.push(`duplicate device width ${device.width}`);
        }
        keys.add(device.key);
        widths.add(device.width);
    }

    // Strict monotonicity rather than "we will sort it ourselves": a device range
    // is computed as `next.width - 1`, and on an unsorted array that would give an
    // overlapping or a negative range
    for (let i = 1; i < devices.length; i += 1) {
        if (devices[i].width <= devices[i - 1].width) {
            errors.push('devices must be sorted by ascending width');
            break;
        }
    }

    for (const required of REQUIRED_DEVICE_KEYS) {
        if (!keys.has(required)) {
            errors.push(`device "${required}" is required`);
        }
    }

    if (devices.length > 0) {
        if (devices[0].key !== NARROW_DEVICE_KEY) {
            errors.push(`device "${NARROW_DEVICE_KEY}" must be the narrowest`);
        }
        if (devices[devices.length - 1].key !== BASE_DEVICE_KEY) {
            errors.push(`device "${BASE_DEVICE_KEY}" must be the widest`);
        }
    }
}

/**
 * Copies a device set, detaching the entries from their source.
 *
 * Two jobs at once. First, independence of the data: a page copy sharing the
 * array with the original would change the widths of both. Second, shedding the
 * reactive wrapper: a set inside form state is a Proxy, and a structured clone of
 * a Proxy throws `DataCloneError`, so it cannot be handed to `postMessage`
 * directly.
 *
 * @param config - Device set or `null`/`undefined`.
 * @returns An independent copy made of plain objects, or `null`.
 */
export function cloneDeviceSet(
    config: ReadonlyArray<IBricksPageDevice> | null | undefined
): TBricksPageDeviceSet | null {
    return config ? config.map((device) => ({ ...device })) : null;
}

/**
 * Validates the device set of a page.
 *
 * It deliberately repairs nothing: a corrupted set brought to a "valid" one by
 * sorting and trimming would silently acquire new semantics — it could lose a
 * mandatory device or shift the ranges. A rejection is visible, a quiet
 * substitution is not.
 *
 * @param input - Raw value (request body, database row, imported file).
 * @param scope - Whose set this is: a project one additionally allows `remBase`.
 * @returns Success with the normalized set, or the list of rejection reasons.
 */
export function validateDeviceSet(
    input: unknown,
    scope: 'page' | 'project' = 'page'
): TBricksDeviceSetValidation {
    const errors: string[] = [];
    const allowedFields = scope === 'project' ? PROJECT_DEVICE_KEYS : PAGE_DEVICE_KEYS;

    if (!Array.isArray(input)) {
        return { ok: false, errors: ['viewportConfig must be an array'] };
    }

    if (input.length < DEVICE_SET_MIN || input.length > DEVICE_SET_MAX) {
        return {
            ok: false,
            errors: [`viewportConfig must contain ${DEVICE_SET_MIN}..${DEVICE_SET_MAX} devices`],
        };
    }

    const devices: TBricksPageDeviceSet = [];

    input.forEach((raw, index) => {
        const device = validateDevice(raw, index, errors, allowedFields);
        if (device) {
            devices.push(device);
        }
    });

    if (errors.length > 0) {
        return { ok: false, errors };
    }

    validateSetShape(devices, errors);

    return errors.length > 0 ? { ok: false, errors } : { ok: true, value: devices };
}
// #endregion

// #region Resolve
/**
 * Completes a page entry into a resolved one: `remBase` is taken from the project
 * device of the same key (a project property, a page does not set it), and the
 * sheet height from the canonical key.
 *
 * @param device - Entry of the page set.
 * @param projectByKey - Project devices by key.
 * @returns Resolved entry.
 */
function toResolvedDevice(
    device: IBricksPageDevice,
    projectByKey: Map<string, IBricksProjectDevice>
): IBricksResolvedDevice {
    const project = projectByKey.get(device.key);

    return {
        ...device,
        remBase: project?.remBase ?? DEFAULT_REM_BASE,
        canvasHeight: DEVICE_CATALOG[device.key]?.canvasHeight ?? DEFAULT_CANVAS_HEIGHT,
    };
}

/**
 * Resolves the device set for a page.
 *
 * `null` — the page inherits the project set. A corrupted set is replaced by the
 * project set as a whole: on a public path it is better to show the page in the
 * project layout than to bring it down — but the substitution is not hushed up,
 * the caller receives it in `usedFallback`.
 *
 * @param pageConfig - The page set or `null`.
 * @param projectDevices - Resolved project set.
 * @returns The resolved set and a flag telling whether the fallback fired.
 */
export function resolveDeviceSet(
    pageConfig: unknown,
    projectDevices: TBricksProjectDeviceSet
): { devices: TBricksResolvedDeviceSet; usedFallback: boolean } {
    const projectByKey = new Map(projectDevices.map((device) => [device.key, device]));
    const resolveProject = (): TBricksResolvedDeviceSet =>
        projectDevices.map((device) => toResolvedDevice(device, projectByKey));

    if (pageConfig === null || pageConfig === undefined) {
        return { devices: resolveProject(), usedFallback: false };
    }

    const validation = validateDeviceSet(pageConfig);

    if (!validation.ok) {
        return { devices: resolveProject(), usedFallback: true };
    }

    return {
        devices: validation.value.map((device) => toResolvedDevice(device, projectByKey)),
        usedFallback: false,
    };
}
// #endregion

// #region Icons
/**
 * Turns the short glyph key of a device into an icon registry key.
 *
 * The schema stores the short key (`device-laptop`) rather than a name from the
 * icon package: the set travels into the page data, and there is no point tying
 * it to a particular icon package. The name differs from the key by the prefix
 * alone, which is why there is no mapping table. An unknown key yields the
 * desktop glyph rather than nothing — a device icon surfaces in the bar, in the
 * tabs and in the flyout, and "icon not found" is more noticeable there than an
 * imprecise glyph.
 *
 * @param icon - Short glyph key from the device entry.
 * @returns Icon registry key.
 */
export function resolveDeviceIcon(icon: string): string {
    const known = ICON_CHOICES.has(icon) ? icon : DEVICE_CATALOG[BASE_DEVICE_KEY].icon;

    return `${DEVICE_ICON_PREFIX}${known}`;
}
// #endregion

// #region Ranges
/**
 * Computes the window width ranges out of the set.
 *
 * The narrowest device serves the range starting at 0, the widest one has no
 * upper bound, and the intermediate ones go up to the width of the next device
 * minus a pixel. That is why there are no gaps and no overlaps by construction,
 * and no separate list of thresholds is needed.
 *
 * @param devices - The set, sorted by ascending width.
 * @returns The ranges in the same order.
 */
export function deviceRanges(devices: ReadonlyArray<IBricksPageDevice>): IBricksDeviceRange[] {
    return devices.map((device, index) => ({
        key: device.key,
        min: index === 0 ? 0 : device.width,
        max: index === devices.length - 1 ? Number.POSITIVE_INFINITY : devices[index + 1].width - 1,
    }));
}
// #endregion
