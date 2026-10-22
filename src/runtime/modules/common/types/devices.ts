/**
 * The device set: the single source of both the canvas widths and the media-query
 * thresholds.
 *
 * `width` plays both roles at once — it is the width of the sheet in the builder
 * and the `min-width` of the range on a published page. There is no separate list
 * of thresholds any more, so there are no gaps and no overlaps between the steps by
 * construction: the narrowest device serves the range starting at 0, the widest one
 * has no upper bound.
 */

/**
 * A device entry in the set of a page.
 *
 * The `key` reaches the schema (`props.responsive[key]`, `deviceVisibility[key]`)
 * and the names of the CSS variables, so it does not change after creation:
 * recomputing the key when the label is renamed would orphan every override of
 * every block.
 */
export interface IBricksPageDevice {
    key: string;
    label: string;
    /** Glyph key from the fixed set (`DEVICE_ICON_CHOICES`) */
    icon: string;
    /** Canvas width (px) and the `min-width` of the media-query range */
    width: number;
    /** Side padding of `.bricks-container`, rem */
    aside: number;
    maxWidth?: number;
    minWidth?: number;
}

/**
 * A device of the project set: the same thing plus the single knob a page cannot
 * have. `remBase` is a property of the whole project (a non-standard
 * `html { font-size }`), and editing it per page would mean one page living in a
 * different rem system than the rest.
 */
export interface IBricksProjectDevice extends IBricksPageDevice {
    /** Rem base of the widget, e.g. `10px` or `0.6944vw` */
    remBase?: string;
}

/**
 * A device after resolution: plus the data neither a page nor the project has.
 * `canvasHeight` is the height of the sheet in the builder, a pure property of the
 * interface: on a published page a device has no height at all, and there is no
 * point storing it in the schema.
 */
export interface IBricksResolvedDevice extends IBricksProjectDevice {
    canvasHeight: number;
}

export type TBricksPageDeviceSet = IBricksPageDevice[];
export type TBricksProjectDeviceSet = IBricksProjectDevice[];
export type TBricksResolvedDeviceSet = IBricksResolvedDevice[];

/**
 * The window width range a device serves.
 * The narrowest one has `min` equal to 0, the widest one has `max` of `Infinity`.
 */
export interface IBricksDeviceRange {
    key: string;
    min: number;
    max: number;
}

/**
 * An entry of the catalog of known devices.
 *
 * The catalog is the single table the default project set, the list of choices when
 * adding a device and the canvas sheet height all come from. Its labels are in
 * English: this is data traveling into the page schema rather than interface text
 * — otherwise the set would depend on the language selected at the moment of
 * creation.
 */
export interface IBricksDeviceCatalogEntry {
    label: string;
    icon: string;
    width: number;
    aside: number;
    maxWidth?: number;
    /** UI only: base height of the canvas sheet, px */
    canvasHeight: number;
}

/**
 * A choice when adding a device: a catalog entry along with its key.
 */
export interface IBricksDeviceChoice extends IBricksDeviceCatalogEntry {
    key: string;
}

/** Outcome of validating a set: success with a value, or the list of rejection reasons */
export type TBricksDeviceSetValidation =
    | { ok: true; value: TBricksPageDeviceSet }
    | { ok: false; errors: string[] };
