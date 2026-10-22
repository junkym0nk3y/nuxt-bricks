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
 * Rounds a rem value to one decimal place, keeping its sign.
 *
 * Apart from `toRem` this one does NOT clamp at zero: a margin is allowed to be
 * negative — pulling a block onto its neighbor is a layout, not a mistake — and the
 * property declares no lower bound. Everything measured from an edge (a padding, a
 * size) keeps to `toRem`, where a negative value is meaningless CSS.
 *
 * @param v - Arbitrary value (a number of rem).
 * @returns CSS value in rem.
 */
export function toSignedRem(v: unknown): string {
    return `${Math.round((Number(v) || 0) * 10) / 10}rem`;
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
 * Whether a property carries a value anywhere: in the base props or in the overrides
 * of any device.
 *
 * The question is asked by a render deciding whether to declare a CSS property at all.
 * A block with no background of its own must not emit `background-color: transparent`:
 * an explicit declaration beats a stylesheet of the consumer that paints the section
 * from the outside, while the absence of one leaves that styling alone. Once a
 * background exists on at least one device, the declaration has to be there on all of
 * them — that is what lets a device reset it back to transparent.
 *
 * @param props - The block props as a whole (`props.responsive` is needed).
 * @param key - Name of the property.
 * @param base - The base value of the property.
 * @returns Whether at least one of the values is non-empty.
 */
export function hasResponsiveValue(
    props: Record<string, unknown>,
    key: string,
    base: unknown
): boolean {
    if (base) {
        return true;
    }

    return getOverriddenDeviceKeys(props).some((device) => {
        const overrides = getResponsiveOverrides(props, device);

        return Boolean(overrides[key]);
    });
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
 * The keys the group is derived FROM are named explicitly, and a device whose
 * overrides touch none of them is skipped. Without that a single override of an
 * unrelated property — a padding of its own, say — would make the device emit a copy
 * of every variable of the group, identical to the base one: dead weight in the markup
 * of every instance of the block on the page.
 *
 * @param prefix - Prefix shared by the group (for example, '--bricks-grid').
 * @param props - The block props as a whole (`props.responsive` is needed).
 * @param keys - Names of the properties the values of the group are computed from.
 * @param compute - Computes the values of the group from the resolved props.
 * @returns Object of CSS variables with the `-base` and `-<device key>` suffixes.
 */
export function makeResponsiveVarGroup(
    prefix: string,
    props: Record<string, unknown>,
    keys: readonly string[],
    compute: (resolved: Record<string, unknown>) => Record<string, string>
): Record<string, string> {
    const vars: Record<string, string> = {};

    for (const [name, value] of Object.entries(compute(props))) {
        vars[`${prefix}-${name}-${BASE_VAR_SUFFIX}`] = value;
    }

    for (const device of getOverriddenDeviceKeys(props)) {
        const overrides = getResponsiveOverrides(props, device);

        if (!keys.some((key) => hasOwnKey(overrides, key))) {
            continue;
        }

        const resolved = { ...props, ...overrides };

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
