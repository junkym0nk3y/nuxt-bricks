/**
 * Utilities shared by the layout blocks for responsive CSS variables and grid
 * placement. Used by the published renderer and by the block definitions.
 */

// Types
import type { IBricksComponent, TBricksDeviceKey } from '../../common/types/brick';

// Constants
import {
    BASE_DEVICE_KEY,
    BASE_VAR_SUFFIX,
    DEVICE_KEY_PATTERN,
} from '../../common/constants/devices';

// Utils
import { hasOwnKey } from '../../common/utils/safeRecord';

/**
 * Rounds a rem value to one decimal place.
 *
 * @param v - Arbitrary value (a number of rem).
 * @returns CSS value in rem (no less than 0).
 */
export function toRem(v: unknown): string {
    return `${Math.round(Math.max(0, Number(v) || 0) * 10) / 10}rem`;
}

/**
 * Returns the overrides object of a particular device out of `props.responsive`.
 *
 * @param props - Props of the layout component.
 * @param device - Device key.
 * @returns Overrides of the device, or an empty object.
 */
export function getResponsiveOverrides(
    props: Record<string, unknown>,
    device: TBricksDeviceKey
): Record<string, unknown> {
    const rawResponsive = props?.responsive;
    if (!rawResponsive || typeof rawResponsive !== 'object') {
        return {};
    }

    const responsive = rawResponsive as Record<string, unknown>;
    const overrides = responsive[device];

    return overrides && typeof overrides === 'object' ? (overrides as Record<string, unknown>) : {};
}

/**
 * Returns the keys of the devices that really do have overrides in the block schema.
 *
 * The key of the base device is dropped: its values live in the ordinary props, and
 * the renderer does not read `responsive.desktop` (see `resolveBlockProps`), so a
 * variable for the base device and the `-base` variable would describe one and the
 * same thing.
 *
 * @param props - Props of the layout component.
 * @returns Keys of the devices that carry overrides.
 */
export function getOverriddenDeviceKeys(props: Record<string, unknown>): string[] {
    const rawResponsive = props?.responsive;
    if (!rawResponsive || typeof rawResponsive !== 'object') {
        return [];
    }

    return Object.entries(rawResponsive as Record<string, unknown>)
        .filter(
            ([key, value]) =>
                key !== BASE_DEVICE_KEY &&
                // The key goes into the NAME of an inline custom property, and the
                // schema is external data: a legacy file or somebody else's backend
                // can bring in anything, and `x; color: red` would produce a broken
                // style attribute. An invalid key is simply not emitted — it stays
                // in the JSON
                DEVICE_KEY_PATTERN.test(key) &&
                key !== BASE_VAR_SUFFIX &&
                Boolean(value) &&
                typeof value === 'object' &&
                Object.keys(value as Record<string, unknown>).length > 0
        )
        .map(([key]) => key);
}

/**
 * Creates the CSS variables of a responsive property: the base one plus one per
 * device that really does override that property.
 *
 * The full mobile/tablet/desktop triple used to be emitted. With an arbitrary set of
 * devices, a full table would mean threading the active set through every definition
 * and both rendering contexts (canvas and published), and a single missed context
 * would make the builder disagree with the published page. So the set is not needed
 * here: CSS picks up the missing steps — the active rule reads the device variable
 * with a fallback to `-base` (see `responsiveCss.ts`).
 *
 * @param prefix - Variable prefix (for example, '--bricks-section-pt').
 * @param base - Base value.
 * @param props - The block props as a whole (`props.responsive` is needed).
 * @param key - Name of the property inside the overrides.
 * @param transform - Turns a value into a CSS string.
 * @returns Object of CSS variables.
 */
export function makeResponsiveVars(
    prefix: string,
    base: unknown,
    props: Record<string, unknown>,
    key: string,
    transform: (v: unknown) => string = String
): Record<string, string> {
    const vars: Record<string, string> = {
        [`${prefix}-${BASE_VAR_SUFFIX}`]: transform(base),
    };

    for (const device of getOverriddenDeviceKeys(props)) {
        const overrides = getResponsiveOverrides(props, device);

        if (hasOwnKey(overrides, key)) {
            vars[`${prefix}-${device}`] = transform(overrides[key]);
        }
    }

    return vars;
}

/**
 * Creates a group of related CSS variables: the base group plus one group per device
 * that carries overrides.
 *
 * Needed wherever the variables are derived and cannot be reconciled one at a time:
 * in Grid, `columns` drags `auto-flow` and both lead columns along with it, while
 * `rowHeight` and `minRowHeight` drag `rows` and `auto-rows`. Override one variable
 * of the group and leave the rest on the base values, and the result is a grid with
 * the new number of columns and the old span of the accent cell. That is why the
 * group is computed as a whole from the props merged with the device overrides.
 *
 * @param prefix - Prefix shared by the group (for example, '--bricks-grid').
 * @param props - The block props as a whole (`props.responsive` is needed).
 * @param compute - Computes the values of the group from the resolved props.
 * @returns Object of CSS variables with the `-base` and `-<device key>` suffixes.
 */
export function makeResponsiveVarGroup(
    prefix: string,
    props: Record<string, unknown>,
    compute: (resolved: Record<string, unknown>) => Record<string, string>
): Record<string, string> {
    const vars: Record<string, string> = {};

    for (const [name, value] of Object.entries(compute(props))) {
        vars[`${prefix}-${name}-${BASE_VAR_SUFFIX}`] = value;
    }

    for (const device of getOverriddenDeviceKeys(props)) {
        const resolved = { ...props, ...getResponsiveOverrides(props, device) };

        for (const [name, value] of Object.entries(compute(resolved))) {
            vars[`${prefix}-${name}-${device}`] = value;
        }
    }

    return vars;
}

/**
 * Returns the inline styles that place a component inside its parent Grid.
 *
 * @param component - Schema component.
 * @returns Object with gridColumn/gridRow (only the ones that are set).
 */
export function gridPlacementStyle(component: IBricksComponent): Record<string, string> {
    const style: Record<string, string> = {};

    if (component.gridColumn) {
        style.gridColumn = component.gridColumn;
    }
    if (component.gridRow) {
        style.gridRow = component.gridRow;
    }

    return style;
}
