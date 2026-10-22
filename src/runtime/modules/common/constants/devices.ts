/**
 * The single source of knowledge about the device set.
 *
 * It used to live as three independent copies, and they drifted apart: the
 * schema keys were a literal type of three, the canvas widths sat in
 * `bricks.breakpoints` of app.config, and the media-query thresholds were a
 * separate `device.breakpoints` list that was not tied to the widths at all.
 * Because of that the `laptop: 1024` step declared among the thresholds never
 * reached the CSS generation, and a 1280 window got the tablet layout even
 * though the builder showed that very screen as a desktop one.
 *
 * Now a device width is both the builder sheet and the `min-width` of its range.
 * The default can be overridden with the build-time module option
 * `bricks.devices`; the same option feeds the SCSS map of the mixins, so the
 * runtime and the brick authors work off the same numbers.
 */

// Types
import type {
    IBricksDeviceCatalogEntry,
    IBricksDeviceChoice,
    TBricksProjectDeviceSet,
} from '../types/devices';

/** Key of the base device: its props sit in the schema without a `responsive` wrapper */
export const BASE_DEVICE_KEY = 'desktop';

/** Key of the narrowest device */
export const NARROW_DEVICE_KEY = 'mobile';

/**
 * The outermost devices are mandatory and cannot be removed, while the
 * intermediate ones have to fit strictly between them. From these two rules it
 * follows that `mobile` is always the first and `desktop` always the last; that
 * invariant is what keeps the base of the overrides and the device canonical for
 * SEO fixed keys rather than "the widest device of the set".
 */
export const REQUIRED_DEVICE_KEYS = [NARROW_DEVICE_KEY, BASE_DEVICE_KEY] as const;

export const DEVICE_SET_MIN = 2;
export const DEVICE_SET_MAX = 4;

/**
 * No block is designed for anything below 320 — the editor does not accept such
 * a width. The upper bound is 8K: not so much a real screen as the ceiling past
 * which the value is certainly garbage.
 */
export const DEVICE_MIN_WIDTH = 320;
export const DEVICE_MAX_WIDTH = 7680;

export const DEVICE_KEY_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;

/**
 * Suffix of the base value of the responsive variables
 * (`--bricks-grid-columns-base`). That is why the `base` key is taken: a device
 * with such a key would overwrite the default value of every block at once.
 */
export const BASE_VAR_SUFFIX = 'base';

/** Step of the rem fields: the 0.2 multiple rule applies to entered values too */
export const DEVICE_REM_STEP = 0.2;

/** Ceiling of the rem fields — certainly above any meaningful padding or max-width */
export const DEVICE_REM_MAX = 1000;

/** Canvas sheet height for a device that is not in the catalog */
export const DEFAULT_CANVAS_HEIGHT = 1080;

/** The library's rem base: the builder forces `html { font-size: 10px }` */
export const DEFAULT_REM_BASE = '10px';

/**
 * The device catalog — one table for everything: the default project set, the
 * choices when adding a row and the canvas sheet height.
 *
 * Exactly four entries, and that is not a placeholder "for the future": a device
 * is added by picking from this list rather than by free input, so every extra
 * row here is an extra menu item. The key travels into the schema
 * (`props.responsive[key]`) and into CSS variable names, while the label is
 * edited by the user in the table row.
 */
export const DEVICE_CATALOG: Record<string, IBricksDeviceCatalogEntry> = {
    mobile: { label: 'Mobile', icon: 'device-mobile', width: 375, aside: 0.4, canvasHeight: 812 },
    tablet: { label: 'Tablet', icon: 'device-tablet', width: 768, aside: 0.8, canvasHeight: 1024 },
    laptop: { label: 'Laptop', icon: 'device-laptop', width: 1280, aside: 1.2, canvasHeight: 800 },
    desktop: {
        label: 'Desktop',
        icon: 'device-desktop',
        width: 1600,
        aside: 2,
        maxWidth: 192,
        canvasHeight: 1080,
    },
};

/**
 * Glyphs to choose an icon from — one per catalog device.
 *
 * A short key rather than a name from the icon package: the set travels into the
 * page schema, and there is no point tying it to a particular icon package. The
 * full name is built by prepending a prefix (see `resolveDeviceIcon`), so there
 * is no second mapping table.
 */
export const DEVICE_ICON_CHOICES: string[] = Object.values(DEVICE_CATALOG).map(
    (entry) => entry.icon
);

/** Icon registry prefix: it is the only difference between a short glyph key and a name */
export const DEVICE_ICON_PREFIX = 'ta:outline-';

/**
 * Assembles a set entry from the catalog: `canvasHeight` is not stored in the
 * set — it is a property of the interface, not of the page layout.
 *
 * @param key - Catalog device key.
 * @returns Device set entry.
 */
function toPageDevice(key: string): TBricksProjectDeviceSet[number] {
    const { canvasHeight: _canvasHeight, ...device } = DEVICE_CATALOG[key];

    return { key, ...device };
}

/**
 * The default project set. Exactly the three devices that used to be hardcoded —
 * adding a fourth step here would silently change the published layout of every
 * existing page. A page adds the laptop for itself.
 */
export const DEFAULT_BRICKS_DEVICES: TBricksProjectDeviceSet = [
    NARROW_DEVICE_KEY,
    'tablet',
    BASE_DEVICE_KEY,
].map(toPageDevice);

/**
 * Catalog entries that can be added as a row: the outermost devices are
 * mandatory and already stand in the set, so there is no place for them among
 * the choices.
 */
export const DEVICE_CHOICES: IBricksDeviceChoice[] = Object.entries(DEVICE_CATALOG)
    .filter(([key]) => !(REQUIRED_DEVICE_KEYS as ReadonlyArray<string>).includes(key))
    .map(([key, entry]) => ({ key, ...entry }));
